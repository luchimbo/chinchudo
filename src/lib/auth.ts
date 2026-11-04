import * as React from "react";
import { optimizedLoading } from "./performance-flags";
import { operationTiming } from "./performance";
// Next supplies request cache in RSC. Standalone workers use no shared cache.
const requestCache: typeof React.cache = React.cache ?? ((fn) => fn);
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Client, PrismaClient } from "@prisma/client";
import { verifyJwt } from "./auth-crypto";

export type AuthUser = {
  username: string;
  label: string;
  role: "admin" | "operator";
  clientSlugs: string[];
  accessType: "tenant_user" | "support_session";
  supportSessionId?: string;
  needsOnboarding?: boolean;
};

const readTenantRecord = requestCache(async (email: string) => {
  const { prisma } = await import("./db");
  const [row] = await prisma.$queryRaw<{ tokenVersion: number; role: string; client: Client; clientCreatedAt: Date; clientUpdatedAt: Date; needsOnboarding: boolean }[]>`
    SELECT u."tokenVersion", u.role, to_jsonb(c) AS client, c."createdAt" AS "clientCreatedAt", c."updatedAt" AS "clientUpdatedAt",
      coalesce(o.status::text != 'COMPLETED' AND b."lastSuccessfulAt" IS NULL, false) AS "needsOnboarding"
    FROM "User" u JOIN "Client" c ON c.id = u."clientId"
    LEFT JOIN "ClientOnboarding" o ON o."clientId" = c.id
    LEFT JOIN "BusinessProfile" b ON b."clientId" = c.id
    WHERE u.email = ${email}`.catch(() => []);
  return row ? { ...row, client: { ...row.client, createdAt: row.clientCreatedAt, updatedAt: row.clientUpdatedAt } } : null;
});

/** Signature/expiry only. Callers MUST check current DB membership and tokenVersion
 * atomically with their mutation (fastManualAdmission), never trust this alone. */
export async function getSignedTenantClaims(): Promise<{ email: string; tokenVersion: number } | null> {
  const token = (await cookies()).get("auth_session")?.value, secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  const claims = verifyJwt(token, secret);
  if (claims?.legacy === true || typeof claims?.email !== "string" || !claims.email || !claims.clientSlug || !claims.clientId) return null;
  if (claims.tv !== undefined && typeof claims.tv !== "number") return null;
  return { email: claims.email, tokenVersion: claims.tv ?? 0 };
}

async function readCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const tenantToken = store.get("auth_session")?.value;
  const tenantSecret = process.env.AUTH_SECRET;
  if (tenantToken && tenantSecret) {
    const decoded = verifyJwt(tenantToken, tenantSecret);
    if (decoded?.email && decoded?.clientSlug && decoded?.clientId && decoded?.legacy !== true) {
      const { prisma } = await import("./db");
      const current = optimizedLoading() ? await readTenantRecord(decoded.email) : await prisma.user
        .findUnique({
          where: { email: decoded.email },
          select: { tokenVersion: true, role: true, client: { select: { slug: true } } },
        })
        .catch(() => null);
      // Fail-closed: si el usuario fue borrado o la consulta falló, no hay
      // sesión válida (antes esto dejaba pasar el claim del JWT sin más).
      if (!current || (decoded.tv ?? 0) !== current.tokenVersion) return null;
      return {
        username: decoded.email,
        label: decoded.email.split("@")[0],
        // El rol se lee siempre de la DB, no del claim: así un cambio de rol
        // surte efecto en el próximo request sin esperar a que expire el JWT.
        role: current.role === "admin" ? "admin" : "operator",
        clientSlugs: [current.client.slug],
        accessType: "tenant_user",
        ...("needsOnboarding" in current ? { needsOnboarding: Boolean(current.needsOnboarding) } : {}),
      };
    }
  }

  const supportToken = store.get("support_session")?.value;
  const supportSecret = process.env.SUPPORT_SESSION_SECRET;
  if (!supportToken || !supportSecret) return null;
  try {
    const { verifyJwt } = await import("./auth-crypto");
    const decoded = verifyJwt(supportToken, supportSecret);
    const { isValidSupportClaims } = await import("./support-auth");
    if (!isValidSupportClaims(decoded)) return null;
    const { prisma } = await import("./db");
    const delegated = await prisma.supportSession.findFirst({
      where: {
        id: decoded.sid,
        clientId: decoded.clientId,
        exchangedAt: { not: null },
        revokedAt: null,
        endedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        client: { select: { slug: true } },
        platformAdmin: { select: { name: true, active: true } },
      },
    });
    if (!delegated?.platformAdmin.active) return null;
    return {
      username: `support:${delegated.platformAdminId}`,
      label: `${delegated.platformAdmin.name} · Soporte`,
      role: "admin",
      clientSlugs: [delegated.client.slug],
      accessType: "support_session",
      supportSessionId: delegated.id,
    };
  } catch {
    return null;
  }
}

export const getCurrentUser = requestCache(() => operationTiming("session").measure("authentication", readCurrentUser));

export async function isDefaultIssueReporter(): Promise<boolean> {
  return isDefaultIssueReporterUser(await getCurrentUser());
}

export function isDefaultIssueReporterUser(
  user: Pick<AuthUser, "accessType"> | Pick<AuthUser, "username"> | null,
): boolean {
  return Boolean(user && "accessType" in user && user.accessType === "support_session");
}

export const getVisibleClients = requestCache(async (prisma: PrismaClient): Promise<Client[]> => {
  const user = await getCurrentUser();
  if (!user || user.clientSlugs.length === 0) return [];
  if (optimizedLoading() && user.accessType === "tenant_user") {
    const current = await readTenantRecord(user.username);
    return current?.client.active && user.clientSlugs.includes(current.client.slug) ? [current.client] : [];
  }
  return prisma.client.findMany({
    where: { active: true, slug: { in: user.clientSlugs } },
    orderBy: { name: "asc" },
  });
});

export async function assertClientAccess(prisma: PrismaClient, clientId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado.");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true } });
  if (!client || !user.clientSlugs.includes(client.slug)) {
    throw new Error("No tenés acceso a este cliente.");
  }
}

export class ClientResolutionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Resuelve el cliente para un request: exige un slug explícito cuando la sesión
 * ve más de un cliente, y nunca elige clients[0] entre varios en silencio.
 */
export async function resolveClientForSlug(
  prisma: PrismaClient,
  slug?: string | null,
): Promise<Client> {
  const clients = await getVisibleClients(prisma);
  if (!clients.length)
    throw new ClientResolutionError("No tenés un espacio de trabajo disponible.", 401);
  if (!slug) {
    if (clients.length > 1)
      throw new ClientResolutionError("Especificá el cliente (?client=<slug>).", 400);
    return clients[0];
  }
  const client = clients.find((item) => item.slug === slug);
  if (!client)
    throw new ClientResolutionError("No tenés acceso a este cliente.", 403);
  return client;
}

/**
 * Variante de resolveClientForSlug para server components de página: nunca
 * cae en silencio a clients[0] ni deja pasar un clientFilter vacío. Un 401
 * redirige a /login; el resto se propaga para que lo capture error.tsx.
 */
export async function requirePageClient(
  prisma: PrismaClient,
  slug?: string | null,
): Promise<Client> {
  try {
    return await resolveClientForSlug(prisma, slug);
  } catch (err) {
    if (err instanceof ClientResolutionError && err.status === 401) {
      redirect("/login");
    }
    throw err;
  }
}

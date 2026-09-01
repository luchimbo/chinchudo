import { cookies } from "next/headers";
import type { Client, PrismaClient } from "@prisma/client";
import { verifyJwt } from "./auth-crypto";

export type AuthUser = {
  username: string;
  label: string;
  role: "admin" | "operator";
  clientSlugs: string[];
  accessType: "tenant_user" | "support_session";
  supportSessionId?: string;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const tenantToken = store.get("auth_session")?.value;
  const tenantSecret = process.env.AUTH_SECRET;
  if (tenantToken && tenantSecret) {
    const decoded = verifyJwt(tenantToken, tenantSecret);
    if (decoded?.email && decoded?.clientSlug && decoded?.clientId && decoded?.legacy !== true) {
      const { prisma } = await import("./db");
      const current = await prisma.user
        .findUnique({ where: { email: decoded.email }, select: { tokenVersion: true } })
        .catch(() => null);
      if (current && (decoded.tv ?? 0) !== current.tokenVersion) return null;
      return {
        username: decoded.email,
        label: decoded.email.split("@")[0],
        role: decoded.role === "admin" ? "admin" : "operator",
        clientSlugs: [decoded.clientSlug],
        accessType: "tenant_user",
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

export async function isDefaultIssueReporter(): Promise<boolean> {
  return isDefaultIssueReporterUser(await getCurrentUser());
}

export function isDefaultIssueReporterUser(
  user: Pick<AuthUser, "accessType"> | Pick<AuthUser, "username"> | null,
): boolean {
  return Boolean(user && "accessType" in user && user.accessType === "support_session");
}

export async function getVisibleClients(prisma: PrismaClient): Promise<Client[]> {
  const user = await getCurrentUser();
  if (!user || user.clientSlugs.length === 0) return [];
  return prisma.client.findMany({
    where: { active: true, slug: { in: user.clientSlugs } },
    orderBy: { name: "asc" },
  });
}

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

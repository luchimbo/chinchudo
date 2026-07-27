import { cookies } from "next/headers";
import type { Client, PrismaClient } from "@prisma/client";

export type AuthUser = {
  username: string;
  label: string;
  role: "admin" | "operator";
  clientSlugs: string[];
  accessType: "tenant_user" | "support_session";
  supportSessionId?: string;
};

type EnvUser = AuthUser & { password: string };
const USER_COOKIE = "auth_user";

function parseUsers(): EnvUser[] {
  const raw = process.env.AUTH_USERS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as EnvUser[];
    return Array.isArray(parsed) ? parsed.filter((u) => u.username && u.password) : [];
  } catch {
    return [];
  }
}

export function findEnvUser(username: string, password: string): AuthUser | null {
  const user = parseUsers().find((u) => u.username === username && u.password === password);
  if (!user) return null;
  return {
    username: user.username,
    label: user.label || user.username,
    role: user.role === "admin" ? "admin" : "operator",
    clientSlugs: user.clientSlugs ?? [],
    accessType: "tenant_user",
  };
}

export function encodeAuthUser(user: AuthUser): string {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

export function decodeAuthUser(value: string | undefined): AuthUser | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AuthUser;
    if (!parsed.username) return null;
    return {
      username: parsed.username,
      label: parsed.label || parsed.username,
      role: parsed.role === "admin" ? "admin" : "operator",
      clientSlugs: Array.isArray(parsed.clientSlugs) ? parsed.clientSlugs : [],
      accessType: "tenant_user",
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const tenantToken = store.get("auth_session")?.value;
  const tenantSecret = process.env.AUTH_SECRET;
  if (tenantToken && tenantSecret) {
    try {
      const { verifyJwt } = await import("./auth-crypto");
      const decoded = verifyJwt(tenantToken, tenantSecret);
      if (decoded?.email && decoded?.clientSlug && decoded?.clientId && decoded?.legacy !== true) {
        return {
          username: decoded.email,
          label: decodeAuthUser(store.get(USER_COOKIE)?.value)?.label || decoded.email.split("@")[0],
          role: decoded.role === "admin" ? "admin" : "operator",
          clientSlugs: [decoded.clientSlug],
          accessType: "tenant_user",
        };
      }
    } catch {
      // A delegated support session may still be valid.
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

export function authUserCookieName() {
  return USER_COOKIE;
}

export async function assertClientAccess(prisma: PrismaClient, clientId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado.");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true } });
  if (!client || !user.clientSlugs.includes(client.slug)) {
    throw new Error("No tenés acceso a este cliente.");
  }
}

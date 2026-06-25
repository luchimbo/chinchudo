import { cookies } from "next/headers";
import type { Client, PrismaClient } from "@prisma/client";

export type AuthUser = {
  username: string;
  label: string;
  role: "admin" | "operator";
  clientSlugs: string[];
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
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const session = store.get("auth_session")?.value;
  if (!session) return null;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  // 1. Caso Legado
  if (session === secret) {
    return {
      username: "default",
      label: "Administrador Global",
      role: "admin",
      clientSlugs: [],
    };
  }

  // 2. Caso JWT de Base de Datos
  try {
    const { verifyJwt } = await import("./auth-crypto");
    const decoded = verifyJwt(session, secret);
    if (!decoded || !decoded.email) return null;

    // Para mantener consistencia con los nombres de operador
    const label = store.get(USER_COOKIE)?.value 
      ? decodeAuthUser(store.get(USER_COOKIE)?.value)?.label || decoded.email.split("@")[0]
      : decoded.email.split("@")[0];

    return {
      username: decoded.email,
      label,
      role: decoded.role as "admin" | "operator",
      clientSlugs: [decoded.clientSlug],
    };
  } catch {
    return null;
  }
}

export async function getVisibleClients(prisma: PrismaClient): Promise<Client[]> {
  const user = await getCurrentUser();
  const where = user && user.role !== "admin" && user.clientSlugs.length > 0
    ? { active: true, slug: { in: user.clientSlugs } }
    : { active: true };
  return prisma.client.findMany({ where, orderBy: { name: "asc" } });
}

export function authUserCookieName() {
  return USER_COOKIE;
}

/**
 * Lanza si el usuario actual no puede operar sobre el cliente dado.
 * Admin (o sin sesión en desarrollo, donde el middleware no exige login) pasa siempre.
 * Evita que un form manipulado cree/edite datos de un cliente fuera del alcance del usuario.
 */
export async function assertClientAccess(prisma: PrismaClient, clientId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true } });
  if (!client || !user.clientSlugs.includes(client.slug)) {
    throw new Error("No tenés acceso a este cliente.");
  }
}

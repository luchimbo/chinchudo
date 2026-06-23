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
  return decodeAuthUser(store.get(USER_COOKIE)?.value);
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

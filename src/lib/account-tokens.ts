import { randomBytes, createHash } from "node:crypto";

/**
 * Mismo patrón que src/lib/support-auth.ts: el token que viaja en el link
 * nunca se guarda en DB, sólo su hash. Un solo uso, expiración corta.
 */
export function generateAccountToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccountToken(token: string): string {
  const pepper = process.env.SUPPORT_EXCHANGE_PEPPER || process.env.AUTH_SECRET || "";
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

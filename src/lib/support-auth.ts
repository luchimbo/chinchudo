import { createHash } from "node:crypto";

export function hashSupportExchangeCode(code: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

export function isValidSupportClaims(value: unknown): value is {
  type: "support_session";
  sid: string;
  clientId: string;
} {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return claims.type === "support_session"
    && typeof claims.sid === "string"
    && claims.sid.length > 0
    && typeof claims.clientId === "string"
    && claims.clientId.length > 0;
}

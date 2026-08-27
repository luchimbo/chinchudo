import { createHmac, timingSafeEqual } from "node:crypto";

function signState(payload: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createYouTubeOAuthState(clientId: string, account: string, nonce: string): string {
  const payload = [clientId, account, Date.now().toString(), nonce].join(".");
  return `${Buffer.from(payload).toString("base64url")}.${signState(payload)}`;
}

export function verifyYouTubeOAuthState(state: string, expectedState: string | undefined): { clientId: string; account: string } | null {
  if (!expectedState || state.length !== expectedState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) return null;
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expectedSignature = signState(payload);
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  const [clientId, account, issuedAt] = payload.split(".");
  if (!clientId || !account || !issuedAt || Date.now() - Number(issuedAt) > 10 * 60 * 1000) return null;
  return { clientId, account };
}

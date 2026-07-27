import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

/**
 * Hashea una contraseña usando scrypt nativo con un salt único.
 * Retorna el string formateado como "salt:hash"
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifica si una contraseña coincide con el hash almacenado en base de datos.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const verifyHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

const DEFAULT_JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días, igual que maxAge de la cookie

/**
 * Firma un JWT usando HMAC-SHA256 con el secret dado.
 * Agrega iat y exp (default 7 días) al payload.
 */
export function signJwt(payload: object, secret: string, ttlSeconds: number = DEFAULT_JWT_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signatureInput).digest("base64url");

  return `${signatureInput}.${signature}`;
}

/**
 * Verifica y parsea un JWT firmado con HMAC-SHA256.
 * Retorna el payload decodificado, o null si la firma es inválida o el token expiró.
 * Tokens sin exp (emitidos antes de este cambio) se rechazan: fuerza re-login.
 */
export function verifyJwt(token: string, secret: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac("sha256", secret).update(signatureInput).digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (typeof payload?.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

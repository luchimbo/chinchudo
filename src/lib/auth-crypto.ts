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

/**
 * Firma un JWT usando HMAC-SHA256 con el secret dado.
 */
export function signJwt(payload: object, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signatureInput).digest("base64url");
  
  return `${signatureInput}.${signature}`;
}

/**
 * Verifica y parsea un JWT firmado con HMAC-SHA256.
 * Retorna el payload decodificado, o null si la firma es inválida.
 */
export function verifyJwt(token: string, secret: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac("sha256", secret).update(signatureInput).digest("base64url");
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
}

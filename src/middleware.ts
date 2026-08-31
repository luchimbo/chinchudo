import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/registro", "/api/auth", "/api/support/exchange", "/l"];

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyEdgeJwt(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const signatureInputData = encoder.encode(`${encodedHeader}.${encodedPayload}`);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = base64UrlToUint8Array(signature);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as any,
      signatureInputData
    );

    if (!isValid) return null;

    const decodedPayload = atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(decodedPayload);
    if (typeof payload?.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function supportSessionIsActive(id: string, clientId: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;
  const params = new URLSearchParams({
    select: "id",
    id: `eq.${id}`,
    clientId: `eq.${clientId}`,
    revokedAt: "is.null",
    endedAt: "is.null",
    exchangedAt: "not.is.null",
    expiresAt: `gt.${new Date().toISOString()}`,
    limit: "1",
  });
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/SupportSession?${params}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Muestra el recorrido sin datos persistentes exclusivamente durante el
  // desarrollo local. En producción la ruta queda protegida por sesión.
  if (pathname === "/onboarding" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }
  if (pathname === "/api/onboarding/preview" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Rutas públicas: login, registro y APIs de auth
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Archivos estáticos de Next.js
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const session = request.cookies.get("auth_session")?.value;
  const supportSession = request.cookies.get("support_session")?.value;
  const secret  = process.env.AUTH_SECRET;
  const supportSecret = process.env.SUPPORT_SESSION_SECRET;

  if ((!secret || !session) && (!supportSecret || !supportSession)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validar firma y expiración del JWT (emitido por login de usuario o login maestro)
  const tenantPayload = session && secret ? await verifyEdgeJwt(session, secret) : null;
  const supportPayload = supportSession && supportSecret
    ? await verifyEdgeJwt(supportSession, supportSecret)
    : null;
  const tenantValid = Boolean(
    tenantPayload?.email && tenantPayload?.clientId && tenantPayload?.clientSlug && !tenantPayload?.legacy
  );
  const supportShapeValid = Boolean(
    supportPayload?.type === "support_session" && supportPayload?.sid && supportPayload?.clientId
  );
  const supportValid = supportShapeValid
    ? await supportSessionIsActive(supportPayload.sid, supportPayload.clientId)
    : false;
  if (!tenantValid && !supportValid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

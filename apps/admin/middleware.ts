import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "platform_admin_access_token";
const REFRESH_COOKIE = "platform_admin_refresh_token";
const PERSISTENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

function tokenExpiresSoon(token: string | undefined): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now() + REFRESH_AHEAD_MS;
  } catch {
    return true;
  }
}

function clearSession(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(ACCESS_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(REFRESH_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/login") || path.startsWith("/reset-password") || path.startsWith("/api/auth") || path.startsWith("/_next")) {
    return NextResponse.next();
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!tokenExpiresSoon(accessToken)) return NextResponse.next();
  if (!refreshToken) return clearSession(request);

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return clearSession(request);
  try {
    const refreshed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    const session = await refreshed.json();
    if (!refreshed.ok || !session.access_token || !session.refresh_token) return clearSession(request);
    const response = NextResponse.next();
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, maxAge: PERSISTENT_COOKIE_MAX_AGE, path: "/" };
    response.cookies.set(ACCESS_COOKIE, session.access_token, options);
    response.cookies.set(REFRESH_COOKIE, session.refresh_token, options);
    return response;
  } catch {
    return clearSession(request);
  }
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"],
};

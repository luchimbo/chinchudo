import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/login") || path.startsWith("/reset-password") || path.startsWith("/api/auth") || path.startsWith("/_next")) {
    return NextResponse.next();
  }
  if (!request.cookies.get("platform_admin_access_token")?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"],
};

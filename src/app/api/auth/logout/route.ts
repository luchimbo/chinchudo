import { NextRequest, NextResponse } from "next/server";
import { authUserCookieName } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", req.url));
  response.cookies.set("auth_session", "", { maxAge: 0, path: "/" });
  response.cookies.set(authUserCookieName(), "", { maxAge: 0, path: "/" });
  return response;
}

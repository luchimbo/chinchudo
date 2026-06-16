import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const form     = await req.formData();
  const password = form.get("password") as string;
  const from     = (form.get("from") as string) || "/";

  const correct = process.env.AUTH_PASSWORD;
  const secret  = process.env.AUTH_SECRET;

  if (!correct || !secret) {
    return NextResponse.redirect(new URL("/login?error=config", req.url));
  }

  if (password !== correct) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "wrong");
    url.searchParams.set("from", from);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(from, req.url));
  response.cookies.set("auth_session", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   60 * 60 * 24 * 7, // 7 días
    path:     "/",
  });
  return response;
}

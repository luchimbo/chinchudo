import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signJwt } from "@/lib/auth-crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h (sesión de panel)

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function clientUserAgent(req: NextRequest): string {
  return (req.headers.get("user-agent") || "").slice(0, 300);
}

function redirectLogin(req: NextRequest, opts: { from?: string; error?: string }): NextResponse {
  const url = new URL("/login", req.url);
  if (opts.error) url.searchParams.set("error", opts.error);
  if (opts.from && opts.from !== "/") url.searchParams.set("from", opts.from);
  return NextResponse.redirect(url, { status: 303 });
}

function rateLimitResponse(resetInMs: number): NextResponse {
  return NextResponse.json(
    { error: "Demasiados intentos, espera un momento e intentá de nuevo." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(resetInMs / 1000)) } },
  );
}

export async function POST(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") || "/login";
  const ip = clientIp(req);

  try {
    const form = await req.formData();
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    const fromForm = String(form.get("from") || "" || from);

    if (!username || !password) {
      return redirectLogin(req, { from: fromForm, error: "invalid" });
    }

    // Rate limit por correo y por IP (independientes).
    const emailKey = username.toLowerCase();
    const rlEmail = checkRateLimit(`login:email:${emailKey}`, 10, 15 * 60 * 1000);
    if (!rlEmail.allowed) return rateLimitResponse(rlEmail.resetInMs);
    const rlIp = checkRateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
    if (!rlIp.allowed) return rateLimitResponse(rlIp.resetInMs);

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return redirectLogin(req, { from: fromForm, error: "config" });
    }

    const user = await prisma.user.findUnique({
      where: { email: emailKey },
      include: { client: { select: { slug: true } } },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      // Intento fallido: el email puede no existir.
      await prisma.loginAuditEvent
        .create({
          data: {
            email: username,
            success: false,
            reason: "invalid_credentials",
            ipAddress: ip,
            userAgent: clientUserAgent(req),
          },
        })
        .catch(() => undefined);
      return redirectLogin(req, { from: fromForm, error: "invalid" });
    }
    if (!user.client?.slug) {
      return redirectLogin(req, { from: fromForm, error: "invalid" });
    }

    // tokenVersion invalida sesssiones antiguas al cambiar la contraseña.
    const token = signJwt(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        clientId: user.clientId,
        clientSlug: user.client.slug,
        tv: user.tokenVersion ?? 0,
      },
      secret,
      AUTH_SESSION_TTL_SECONDS,
    );

    await prisma.loginAuditEvent
      .create({
        data: {
          clientId: user.clientId,
          userId: user.id,
          email: emailKey,
          success: true,
          ipAddress: ip,
          userAgent: clientUserAgent(req),
        },
      })
      .catch(() => undefined);

    const res = redirectLogin(req, { from: fromForm });
    res.cookies.set("auth_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_SESSION_TTL_SECONDS,
    });
    return res;
  } catch (error) {
    console.error("[auth/login] error:", error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Error interno." : `Login failed: ${String(error)}` },
      { status: 500 },
    );
  }
}

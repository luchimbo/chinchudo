import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signJwt } from "@/lib/auth-crypto";
import { hashAccountToken } from "@/lib/account-tokens";
import { validatePassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";

const AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") || "");
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/invitacion/${encodeURIComponent(token)}?error=${reason}`, req.url), { status: 303 });

  if (!token || !name || !password) return fail("missing");
  if (password !== confirmPassword) return fail("match");

  const rl = await checkRateLimit(`accept_invite:${token.slice(0, 16)}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) return fail("ratelimit");

  const secret = process.env.AUTH_SECRET;
  if (!secret) return fail("config");

  const tokenHash = hashAccountToken(token);
  const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash }, include: { client: true } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return fail("invalid");
  }

  const policyCheck = validatePassword(password, invitation.email);
  if (!policyCheck.valid) return fail("policy");

  const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (existing) return fail("taken");

  const { user } = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: invitation.email,
        passwordHash: hashPassword(password),
        name,
        role: invitation.role,
        clientId: invitation.clientId,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.userInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    return { user: newUser };
  });

  const token2 = signJwt(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
      clientSlug: invitation.client.slug,
      tv: 0,
    },
    secret,
    AUTH_SESSION_TTL_SECONDS,
  );

  const response = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  response.cookies.set("auth_session", token2, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_SESSION_TTL_SECONDS,
    path: "/",
  });
  return response;
}

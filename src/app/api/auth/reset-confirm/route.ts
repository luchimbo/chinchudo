import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth-crypto";
import { hashAccountToken } from "@/lib/account-tokens";
import { validatePassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/recuperar/${encodeURIComponent(token)}?error=${reason}`, req.url), { status: 303 });

  if (!token || !password) return fail("missing");
  if (password !== confirmPassword) return fail("match");

  const rl = await checkRateLimit(`reset_confirm:${token.slice(0, 16)}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) return fail("ratelimit");

  const tokenHash = hashAccountToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return fail("invalid");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) return fail("invalid");

  const policyCheck = validatePassword(password, user.email);
  if (!policyCheck.valid) return fail("policy");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password), tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.redirect(new URL("/login?reset=ok", req.url), { status: 303 });
}

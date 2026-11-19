"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth-crypto";
import { validatePassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function changeOwnPassword(formData: FormData) {
  const clientSlug = str(formData, "client");
  const currentPassword = str(formData, "currentPassword");
  const newPassword = str(formData, "newPassword");
  const confirmPassword = str(formData, "confirmPassword");
  const suffix = clientSlug ? `?client=${encodeURIComponent(clientSlug)}` : "";
  const passwordResultUrl = (code: string) => `/configuracion${suffix}${suffix ? "&" : "?"}password=${code}`;

  const user = await getCurrentUser();
  if (!user || user.username === "default") return redirect(passwordResultUrl("session"));
  if (!currentPassword || !newPassword || !confirmPassword) return redirect(passwordResultUrl("missing"));
  if (newPassword !== confirmPassword) return redirect(passwordResultUrl("match"));

  const rl = await checkRateLimit(`change_password:${user.username}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) return redirect(passwordResultUrl("ratelimit"));

  const policyCheck = validatePassword(newPassword, user.username);
  if (!policyCheck.valid) return redirect(passwordResultUrl("policy"));

  const dbUser = await prisma.user.findUnique({ where: { email: user.username } });
  if (!dbUser || !verifyPassword(currentPassword, dbUser.passwordHash)) return redirect(passwordResultUrl("current"));

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });

  revalidatePath("/configuracion");
  redirect(`/configuracion${suffix}${suffix ? "&" : "?"}password=ok`);
}

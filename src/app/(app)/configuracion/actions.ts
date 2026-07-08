"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess, getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth-crypto";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function updateConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);

  const smtpPass = str(formData, "smtpPass");

  await prisma.client.update({
    where: { id },
    data: {
      // Marca
      logoUrl: str(formData, "logoUrl"),
      // Emails
      fromName: str(formData, "fromName"),
      fromEmail: str(formData, "fromEmail"),
      smtpHost: str(formData, "smtpHost"),
      smtpPort: parseInt(str(formData, "smtpPort") || "465", 10) || 465,
      smtpUser: str(formData, "smtpUser"),
      unsubscribeBaseUrl: str(formData, "unsubscribeBaseUrl"),
      trackBaseUrl: str(formData, "trackBaseUrl"),
      ...(smtpPass ? { smtpPass } : {}),
      // Landings — branding
      labName: str(formData, "labName"),
      // Landings — URLs
      storeUrl: str(formData, "storeUrl"),
      blogBaseUrl: str(formData, "blogBaseUrl"),
      // Landings — comportamiento
      autoApprove: formData.get("autoApprove") === "on",
      autoPublish: formData.get("autoPublish") === "on",
    },
  });

  revalidatePath("/configuracion");
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
  if (newPassword.length < 6) return redirect(passwordResultUrl("short"));
  if (newPassword !== confirmPassword) return redirect(passwordResultUrl("match"));

  const dbUser = await prisma.user.findUnique({ where: { email: user.username } });
  if (!dbUser || !verifyPassword(currentPassword, dbUser.passwordHash)) return redirect(passwordResultUrl("current"));

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: hashPassword(newPassword) },
  });

  revalidatePath("/configuracion");
  redirect(`/configuracion${suffix}${suffix ? "&" : "?"}password=ok`);
}

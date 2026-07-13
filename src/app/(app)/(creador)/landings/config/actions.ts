"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function updateLandingsConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const blogBaseUrl = str(formData, "blogBaseUrl");
  const storeUrl = str(formData, "storeUrl");

  await prisma.client.update({
    where: { id },
    data: {
      logoUrl: str(formData, "logoUrl"),
      storeUrl,
      blogBaseUrl,
      autoApprove: formData.get("autoApprove") === "on",
      autoPublish: formData.get("autoPublish") === "on",
    },
  });

  revalidatePath("/landings/config");
}

export async function updateEmailConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);

  const smtpPass = str(formData, "smtpPass");

  await prisma.client.update({
    where: { id },
    data: {
      fromName: str(formData, "fromName"),
      fromEmail: str(formData, "fromEmail"),
      labName: str(formData, "labName"),
      smtpHost: str(formData, "smtpHost"),
      smtpPort: parseInt(str(formData, "smtpPort") || "465", 10) || 465,
      smtpUser: str(formData, "smtpUser"),
      unsubscribeBaseUrl: str(formData, "unsubscribeBaseUrl"),
      trackBaseUrl: str(formData, "trackBaseUrl"),
      ...(smtpPass ? { smtpPass } : {}),
    },
  });

  revalidatePath("/landings/config");
}

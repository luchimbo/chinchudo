"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

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

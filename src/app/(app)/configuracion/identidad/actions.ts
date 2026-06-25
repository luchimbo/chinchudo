"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function toJsonList(raw: FormDataEntryValue | null): string {
  const items = String(raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(items);
}

export async function updateIdentidadConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);

  const apiKey = str(formData, "openrouterApiKey");

  await prisma.client.update({
    where: { id },
    data: {
      name: str(formData, "name"),
      description: str(formData, "description"),
      domainKeywords: toJsonList(formData.get("domainKeywords")),
      domainExclusions: toJsonList(formData.get("domainExclusions")),
      openrouterModel: str(formData, "openrouterModel"),
      ...(apiKey ? { openrouterApiKey: apiKey } : {}),
    },
  });

  revalidatePath("/configuracion/identidad");
}

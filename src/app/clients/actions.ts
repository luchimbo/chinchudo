"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

// Convierte un textarea (una entrada por línea o separadas por coma) en JSON array string.
function toJsonList(raw: FormDataEntryValue | null): string {
  const items = String(raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(items);
}

const baseSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "slug: solo minúsculas, números y guiones"),
  description: z.string().max(2000).optional().transform((v) => v ?? ""),
  openrouterModel: z.string().max(160).optional().transform((v) => v ?? ""),
  autoPublish: z.boolean(),
  autoApprove: z.boolean(),
  active: z.boolean(),
});

function parseBase(formData: FormData) {
  return baseSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    openrouterModel: formData.get("openrouterModel") || undefined,
    autoPublish: formData.get("autoPublish") === "on",
    autoApprove: formData.get("autoApprove") === "on",
    active: formData.get("active") === "on",
  });
}

export async function createClient(formData: FormData) {
  const data = parseBase(formData);
  const apiKey = String(formData.get("openrouterApiKey") ?? "").trim();
  await prisma.client.create({
    data: {
      ...data,
      domainKeywords: toJsonList(formData.get("domainKeywords")),
      domainExclusions: toJsonList(formData.get("domainExclusions")),
      openrouterApiKey: apiKey,
    },
  });
  revalidatePath("/clients");
}

export async function updateClient(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const data = parseBase(formData);
  // La API key solo se actualiza si se escribió una nueva; en blanco = conservar la actual.
  const apiKey = String(formData.get("openrouterApiKey") ?? "").trim();
  await prisma.client.update({
    where: { id },
    data: {
      ...data,
      domainKeywords: toJsonList(formData.get("domainKeywords")),
      domainExclusions: toJsonList(formData.get("domainExclusions")),
      ...(apiKey ? { openrouterApiKey: apiKey } : {}),
    },
  });
  revalidatePath("/clients");
}

export async function clearApiKey(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  await prisma.client.update({ where: { id }, data: { openrouterApiKey: "" } });
  revalidatePath("/clients");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

function toJsonList(raw: FormDataEntryValue | null): string {
  const items = String(raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(items);
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
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

function parseBranding(formData: FormData) {
  return {
    storeUrl: str(formData, "storeUrl"),
    blogBaseUrl: str(formData, "blogBaseUrl"),
    labName: str(formData, "labName"),
    logoUrl: str(formData, "logoUrl"),
    fromName: str(formData, "fromName"),
    fromEmail: str(formData, "fromEmail"),
    smtpHost: str(formData, "smtpHost"),
    smtpPort: parseInt(str(formData, "smtpPort") || "465", 10) || 465,
    smtpUser: str(formData, "smtpUser"),
    unsubscribeBaseUrl: str(formData, "unsubscribeBaseUrl"),
    trackBaseUrl: str(formData, "trackBaseUrl"),
  };
}

export async function createClient(formData: FormData) {
  const data = parseBase(formData);
  const branding = parseBranding(formData);
  const apiKey = str(formData, "openrouterApiKey");
  const smtpPass = str(formData, "smtpPass");
  await prisma.client.create({
    data: {
      ...data,
      ...branding,
      smtpPass,
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
  const branding = parseBranding(formData);
  const apiKey = str(formData, "openrouterApiKey");
  const smtpPass = str(formData, "smtpPass");
  await prisma.client.update({
    where: { id },
    data: {
      ...data,
      ...branding,
      domainKeywords: toJsonList(formData.get("domainKeywords")),
      domainExclusions: toJsonList(formData.get("domainExclusions")),
      ...(apiKey ? { openrouterApiKey: apiKey } : {}),
      ...(smtpPass ? { smtpPass } : {}),
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

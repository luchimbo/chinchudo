"use server";

import { revalidatePath } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "El color debe estar en formato hexadecimal #RRGGBB")
  .transform((value) => value.toUpperCase());

async function validTemplateIds() {
  try {
    const registryPath = path.join(process.cwd(), "landing-build", "templates", "registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { templates?: Array<{ id?: string }> };
    return new Set((registry.templates ?? []).map((template) => template.id).filter(Boolean) as string[]);
  } catch {
    return new Set(["minimalist"]);
  }
}

export async function updateLandingTemplate(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);

  const requestedTemplate = String(formData.get("landingTemplate") ?? "").trim();
  const templates = await validTemplateIds();
  const landingTemplate = templates.has(requestedTemplate) ? requestedTemplate : "minimalist";
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const landingPrimaryColor = hexColorSchema.parse(formData.get("landingPrimaryColor"));
  const landingSecondaryColor = hexColorSchema.parse(formData.get("landingSecondaryColor"));

  await prisma.client.update({
    where: { id },
    data: {
      landingTemplate,
      logoUrl,
      landingPrimaryColor,
      landingSecondaryColor,
    },
  });

  revalidatePath("/landings/editor");
}

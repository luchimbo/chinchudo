"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guards";

// Los prompts son globales (PromptVersion no tiene clientId): cambiarlos
// afecta el comportamiento de IA de toda la plataforma, no de un cliente.
// Piso mínimo hasta que esto migre a apps/admin: sólo admin de tenant.

const promptSchema = z.object({
  name: z.string().min(2).max(120),
  version: z.string().min(1).max(40),
  systemPrompt: z.string().min(3).max(8000),
  userPromptTemplate: z.string().max(8000).optional().transform((v) => v ?? "")
});

function parse(formData: FormData) {
  return promptSchema.parse({
    name: formData.get("name"),
    version: formData.get("version"),
    systemPrompt: formData.get("systemPrompt"),
    userPromptTemplate: formData.get("userPromptTemplate") || undefined
  });
}

export async function createPrompt(formData: FormData) {
  await requireAdmin();
  await prisma.promptVersion.create({ data: { ...parse(formData), active: false } });
  revalidatePath("/prompts");
}

export async function updatePrompt(formData: FormData) {
  await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.promptVersion.update({ where: { id }, data: parse(formData) });
  revalidatePath("/prompts");
}

export async function deletePrompt(formData: FormData) {
  await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.promptVersion.delete({ where: { id } });
  revalidatePath("/prompts");
}

// Activa un prompt y desactiva los demás del mismo `name` (un solo activo por nombre).
export async function activatePrompt(formData: FormData) {
  await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  const target = await prisma.promptVersion.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.promptVersion.updateMany({ where: { name: target.name }, data: { active: false } }),
    prisma.promptVersion.update({ where: { id }, data: { active: true } })
  ]);
  revalidatePath("/prompts");
}

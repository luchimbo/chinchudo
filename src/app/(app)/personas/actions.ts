"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

const personaSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2).max(120),
  role: z.string().min(2).max(1000),
  tone: z.string().min(2).max(1000),
  goals: z.string().min(2).max(1000),
  preferredLength: z.string().max(120).optional().transform((v) => (v && v.length > 0 ? v : "Media")),
  allowedPhrases: z.string().max(2000).optional().transform((v) => v ?? ""),
  forbiddenPhrases: z.string().max(2000).optional().transform((v) => v ?? ""),
  goodExamples: z.string().max(4000).optional().transform((v) => v ?? ""),
  badExamples: z.string().max(4000).optional().transform((v) => v ?? ""),
  avatarUrl: z.string().max(2000).optional().transform((v) => v ?? ""),
  voiceId: z.string().min(2).max(120).optional().transform((v) => v || "es-AR-TomasNeural")
});

function parse(formData: FormData) {
  return personaSchema.parse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    role: formData.get("role"),
    tone: formData.get("tone"),
    goals: formData.get("goals"),
    preferredLength: formData.get("preferredLength") || undefined,
    allowedPhrases: formData.get("allowedPhrases") || undefined,
    forbiddenPhrases: formData.get("forbiddenPhrases") || undefined,
    goodExamples: formData.get("goodExamples") || undefined,
    badExamples: formData.get("badExamples") || undefined,
    avatarUrl: formData.get("avatarUrl") || undefined,
    voiceId: formData.get("voiceId") || undefined
  });
}

export async function createPersona(formData: FormData) {
  const data = parse(formData);
  await assertClientAccess(prisma, data.clientId);
  await prisma.persona.create({ data });
  revalidatePath("/personas");
}

export async function updatePersona(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const data = parse(formData);
  await assertClientAccess(prisma, data.clientId);
  await prisma.persona.update({ where: { id }, data });
  revalidatePath("/personas");
}

export async function deletePersona(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const responses = await prisma.response.count({ where: { personaId: id } });
  if (responses > 0) {
    throw new Error(`No se puede borrar: la persona tiene ${responses} respuesta(s) asociadas.`);
  }
  await prisma.persona.delete({ where: { id } });
  revalidatePath("/personas");
}

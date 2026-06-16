"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

// --- Knowledge base (FAQs) ---

const knowledgeSchema = z.object({
  brandId: optionalId,
  productId: optionalId,
  topic: z.string().min(2).max(200),
  content: z.string().min(3).max(4000),
  confidence: z.enum(["low", "medium", "high"]).default("medium")
});

export async function createKnowledge(formData: FormData) {
  const parsed = knowledgeSchema.parse({
    brandId: formData.get("brandId") || undefined,
    productId: formData.get("productId") || undefined,
    topic: formData.get("topic"),
    content: formData.get("content"),
    confidence: formData.get("confidence") || "medium"
  });
  await prisma.knowledgeBase.create({ data: { ...parsed, source: "manual" } });
  revalidatePath("/knowledge");
}

export async function updateKnowledge(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const parsed = knowledgeSchema.parse({
    brandId: formData.get("brandId") || undefined,
    productId: formData.get("productId") || undefined,
    topic: formData.get("topic"),
    content: formData.get("content"),
    confidence: formData.get("confidence") || "medium"
  });
  await prisma.knowledgeBase.update({ where: { id }, data: parsed });
  revalidatePath("/knowledge");
}

export async function deleteKnowledge(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.knowledgeBase.delete({ where: { id } });
  revalidatePath("/knowledge");
}

// --- Objeciones ---

const objectionSchema = z.object({
  brandId: optionalId,
  productId: optionalId,
  objection: z.string().min(2).max(400),
  recommendedAnswer: z.string().min(3).max(4000),
  personaNotes: z.string().max(2000).optional().transform((v) => v ?? "")
});

export async function createObjection(formData: FormData) {
  const parsed = objectionSchema.parse({
    brandId: formData.get("brandId") || undefined,
    productId: formData.get("productId") || undefined,
    objection: formData.get("objection"),
    recommendedAnswer: formData.get("recommendedAnswer"),
    personaNotes: formData.get("personaNotes") || undefined
  });
  await prisma.objection.create({ data: parsed });
  revalidatePath("/knowledge");
}

export async function updateObjection(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const parsed = objectionSchema.parse({
    brandId: formData.get("brandId") || undefined,
    productId: formData.get("productId") || undefined,
    objection: formData.get("objection"),
    recommendedAnswer: formData.get("recommendedAnswer"),
    personaNotes: formData.get("personaNotes") || undefined
  });
  await prisma.objection.update({ where: { id }, data: parsed });
  revalidatePath("/knowledge");
}

export async function deleteObjection(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.objection.delete({ where: { id } });
  revalidatePath("/knowledge");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const sourceSchema = z.object({
  label: z.string().min(2).max(160),
  channel: z.string().min(2).max(40),
  query: z.string().min(1).max(400),
  account: z.string().max(120).optional().transform((v) => v ?? ""),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(true)
});

function parse(formData: FormData) {
  return sourceSchema.parse({
    label: formData.get("label"),
    channel: formData.get("channel"),
    query: formData.get("query"),
    account: formData.get("account") || undefined,
    limit: formData.get("limit") || 5,
    active: formData.get("active")
  });
}

export async function createSource(formData: FormData) {
  await prisma.monitoredSource.create({ data: parse(formData) });
  revalidatePath("/monitoring");
}

export async function updateSource(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.monitoredSource.update({ where: { id }, data: parse(formData) });
  revalidatePath("/monitoring");
}

export async function deleteSource(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  // Opportunity.monitoredSourceId es SetNull: borrar la fuente no borra detecciones.
  await prisma.monitoredSource.delete({ where: { id } });
  revalidatePath("/monitoring");
}

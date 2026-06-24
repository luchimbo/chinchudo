"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

const brandSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2).max(120),
  positioning: z.string().min(2).max(2000),
  tone: z.string().min(2).max(1000),
  allowedClaims: z.string().max(2000).optional().transform((v) => v ?? ""),
  forbiddenClaims: z.string().max(2000).optional().transform((v) => v ?? "")
});

function parse(formData: FormData) {
  return brandSchema.parse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    positioning: formData.get("positioning"),
    tone: formData.get("tone"),
    allowedClaims: formData.get("allowedClaims") || undefined,
    forbiddenClaims: formData.get("forbiddenClaims") || undefined
  });
}

export async function createBrand(formData: FormData) {
  const data = parse(formData);
  await assertClientAccess(prisma, data.clientId);
  await prisma.brand.create({ data });
  revalidatePath("/brands");
}

export async function updateBrand(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const data = parse(formData);
  await assertClientAccess(prisma, data.clientId);
  await prisma.brand.update({ where: { id }, data });
  revalidatePath("/brands");
}

export async function deleteBrand(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  // Borrar una marca arrastra productos (cascade) y rompe respuestas/oportunidades (Restrict).
  const [responses, opportunities] = await Promise.all([
    prisma.response.count({ where: { brandId: id } }),
    prisma.opportunity.count({ where: { detectedBrandId: id } })
  ]);
  if (responses > 0 || opportunities > 0) {
    throw new Error(
      `No se puede borrar: la marca tiene ${responses} respuesta(s) y ${opportunities} oportunidad(es) asociadas. Reasigná o eliminá esos registros primero.`
    );
  }
  await prisma.brand.delete({ where: { id } });
  revalidatePath("/brands");
}

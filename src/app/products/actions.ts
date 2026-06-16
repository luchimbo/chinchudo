"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const productSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(2).max(200),
  category: z.string().min(2).max(120),
  description: z.string().max(4000).optional().transform((v) => v ?? ""),
  technicalSpecs: z.string().max(4000).optional().transform((v) => v ?? ""),
  useCases: z.string().max(4000).optional().transform((v) => v ?? ""),
  warrantyNotes: z.string().max(2000).optional().transform((v) => v ?? ""),
  stockStatus: z.string().max(120).optional().transform((v) => (v && v.length > 0 ? v : "Por confirmar")),
  priceRange: z.string().max(120).optional().transform((v) => (v && v.length > 0 ? v : "Por confirmar"))
});

function parse(formData: FormData) {
  return productSchema.parse({
    brandId: formData.get("brandId"),
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description") || undefined,
    technicalSpecs: formData.get("technicalSpecs") || undefined,
    useCases: formData.get("useCases") || undefined,
    warrantyNotes: formData.get("warrantyNotes") || undefined,
    stockStatus: formData.get("stockStatus") || undefined,
    priceRange: formData.get("priceRange") || undefined
  });
}

export async function createProduct(formData: FormData) {
  await prisma.product.create({ data: parse(formData) });
  revalidatePath("/products");
}

export async function updateProduct(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.product.update({ where: { id }, data: parse(formData) });
  revalidatePath("/products");
}

export async function deleteProduct(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
}

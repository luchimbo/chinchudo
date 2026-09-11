"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwnedClientId } from "@/lib/auth-guards";

async function requireBrandOwner(brandId: string) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { clientId: true } });
  await requireOwnedClientId(brand.clientId);
}

async function requireProductOwner(productId: string) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { brand: { select: { clientId: true } } },
  });
  await requireOwnedClientId(product.brand.clientId);
}

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
  const data = parse(formData);
  await requireBrandOwner(data.brandId);
  await prisma.product.create({ data });
  revalidatePath("/products");
}

export async function updateProduct(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const data = parse(formData);
  await requireProductOwner(id);
  await requireBrandOwner(data.brandId);
  await prisma.product.update({ where: { id }, data });
  revalidatePath("/products");
}

export async function deleteProduct(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await requireProductOwner(id);
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
}

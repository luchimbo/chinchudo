"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwnedClientId } from "@/lib/auth-guards";
import { findClientProductNamed } from "@/lib/product-identity";

/** Lo que devuelven el alta y la edición al formulario: el error se muestra ahí mismo, sin perder lo escrito. */
export type ProductFormState = { error: string | null };

async function requireBrandOwner(brandId: string) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { clientId: true } });
  await requireOwnedClientId(brand.clientId);
  return brand.clientId;
}

// Mismo criterio que las importaciones: mayúsculas, acentos, signos y "PREVENTA" no hacen otro producto.
async function duplicateNameError(clientId: string | null, name: string, excludeId?: string) {
  const existing = await findClientProductNamed(prisma, clientId, name, excludeId);
  return existing
    ? `Ya existe «${existing.name}» (${existing.brand.name}) en el catálogo. Editá ese producto en lugar de cargar otro con el mismo nombre.`
    : null;
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

export async function createProduct(_state: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const data = parse(formData);
  const clientId = await requireBrandOwner(data.brandId);
  const error = await duplicateNameError(clientId, data.name);
  if (error) return { error };
  await prisma.product.create({ data });
  revalidatePath("/products");
  return { error: null };
}

export async function updateProduct(_state: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const id = z.string().min(1).parse(formData.get("id"));
  const data = parse(formData);
  await requireProductOwner(id);
  const clientId = await requireBrandOwner(data.brandId);
  const error = await duplicateNameError(clientId, data.name, id);
  if (error) return { error };
  await prisma.product.update({ where: { id }, data });
  revalidatePath("/products");
  return { error: null };
}

export async function deleteProduct(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await requireProductOwner(id);
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
}

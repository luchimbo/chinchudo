"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess, getCurrentUser } from "@/lib/auth";
import { safeSourceUrl, verifiedSources, type EditorialSource } from "@/lib/blog-quality.mjs";

async function checkClient(clientId: string) {
  await assertClientAccess(prisma, clientId);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("Las fuentes editoriales están disponibles para PC MIDI.");
}

export async function addEditorialSource(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    await checkClient(clientId);
    const title = z.string().trim().min(3).max(200).parse(formData.get("title"));
    const type = z.enum(["manufacturer", "independent", "case_study", "internal"]).parse(formData.get("type"));
    const url = String(formData.get("url") || "").trim();
    const reference = z.string().trim().max(500).parse(formData.get("reference") || "");
    if (url && !safeSourceUrl(url)) throw new Error("Usá una URL http o https válida.");
    if (!url && !reference) throw new Error("Agregá el enlace o una referencia interna identificable.");
    if (formData.get("verified") !== "on") throw new Error("Revisá la evidencia antes de habilitarla para el generador.");
    const claims = z.string().min(3).max(12000).parse(formData.get("claims")).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!claims.length || claims.length > 30) throw new Error("Ingresá entre 1 y 30 afirmaciones, una por línea.");
    const productIds = formData.getAll("productIds").map(String);
    const count = await prisma.landingProduct.count({ where: { clientId, externalId: { in: productIds } } });
    if (count !== new Set(productIds).size) throw new Error("Seleccioná productos del catálogo de este cliente.");
    const user = await getCurrentUser();
    if (!user) throw new Error("Iniciá sesión para registrar la revisión.");
    const source: EditorialSource = { id: `source-${randomUUID()}`, title, type, url, reference, claims, productIds, reviewedBy: user.label, verifiedAt: new Date().toISOString() };
    await prisma.$transaction(async (tx) => {
      const key = `blog_editorial_sources:${clientId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
      const current = await tx.appSetting.findUnique({ where: { key } });
      const values = verifiedSources(JSON.parse(current?.value || "[]"));
      if (values.length >= 100) throw new Error("El banco admite hasta 100 fuentes revisadas.");
      const value = JSON.stringify([...values, source]);
      await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    });
    revalidatePath("/blog/fuentes");
    return { ok: true, message: "Fuente revisada agregada. Ya puede usarse en nuevos artículos." };
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? "Completá los campos de la fuente." : error instanceof Error ? error.message : "No se pudo guardar la fuente." };
  }
}

export async function removeEditorialSource(formData: FormData) {
  const clientId = z.string().min(1).parse(formData.get("clientId"));
  const id = z.string().min(1).parse(formData.get("id"));
  await checkClient(clientId);
  await prisma.$transaction(async (tx) => {
    const key = `blog_editorial_sources:${clientId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
    const current = await tx.appSetting.findUnique({ where: { key } });
    if (current) await tx.appSetting.update({ where: { key }, data: { value: JSON.stringify(verifiedSources(JSON.parse(current.value)).filter((s) => s.id !== id)) } });
  });
  revalidatePath("/blog/fuentes");
}

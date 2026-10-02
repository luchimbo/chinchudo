"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { argentinaDate, dateOnly, shiftDate } from "@/lib/blog-calendar";
import { inspectBlogArticle } from "@/lib/blog-evidence";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";

async function pcMidiClient(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("Cliente inválido.");
  return id;
}

async function editableSlot(id: string, allowMissed = false) {
  const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { client: { select: { slug: true } } } });
  if (!slot || slot.client.slug !== "pcmidi") throw new Error("Fecha editorial no encontrada.");
  await assertClientAccess(prisma, slot.clientId);
  if (slot.scheduledDate.toISOString().slice(0, 10) <= argentinaDate() && !(allowMissed && ["SKIPPED", "FAILED"].includes(slot.status) && slot.landingId)) throw new Error("Solo se pueden modificar fechas futuras.");
  if (["PUBLISHING", "PUBLISHED"].includes(slot.status)) throw new Error("Este artículo ya está en publicación.");
  return slot;
}

export async function rescheduleBlogArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const target = z.string().parse(formData.get("scheduledDate"));
  const scheduledDate = dateOnly(target);
  if (target <= argentinaDate()) throw new Error("Elegí una fecha futura.");
  const slot = await editableSlot(id, true);
  if (!slot.landingId) throw new Error("Esta fecha aún no tiene artículo para mover.");
  if (slot.scheduledDate.toISOString().slice(0, 10) === target) return;
  const landing = await prisma.landing.findUniqueOrThrow({ where: { id: slot.landingId } });
  const content = JSON.parse(landing.htmlContent);
  if (content.editorial_intent !== editorialIntentForDate(target)) throw new Error("Elegí una fecha para el mismo tipo de artículo (educativo o de elección), para mantener el equilibrio.");
  const quality = await inspectBlogArticle(prisma, slot.clientId, content, landing.id);
  await prisma.$transaction(async (tx) => {
    const occupied = await tx.blogPublication.findUnique({ where: { clientId_scheduledDate: { clientId: slot.clientId, scheduledDate } } });
    if (occupied?.landingId || (occupied && occupied.status !== "PLANNED")) throw new Error("La fecha de destino ya está ocupada.");
    if (occupied) await tx.blogPublication.delete({ where: { id: occupied.id } });
    await tx.landing.update({ where: { id: landing.id }, data: { status: "DRAFT", publishedAt: null } });
    await tx.blogPublication.update({ where: { id }, data: { scheduledDate, status: quality.publishable ? "READY" : "FAILED", attempts: quality.publishable ? 0 : 3, lastError: quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ") } });
  });
  revalidatePath("/blog/calendario");
}

export async function replaceBlogArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  await prisma.$transaction(async (tx) => {
    if (slot.landingId) await tx.landing.update({ where: { id: slot.landingId }, data: { status: "ARCHIVED" } });
    await tx.blogPublication.update({ where: { id }, data: { landingId: null, status: "PLANNED", attempts: 0, lastError: "" } });
  });
  revalidatePath("/blog/calendario");
}

export async function skipBlogDate(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  await prisma.$transaction(async (tx) => {
    if (slot.landingId) await tx.landing.update({ where: { id: slot.landingId }, data: { status: "ARCHIVED" } });
    await tx.blogPublication.update({ where: { id }, data: { landingId: null, status: "SKIPPED", lastError: "Fecha omitida por el operador." } });
  });
  revalidatePath("/blog/calendario");
}

export async function restoreBlogDate(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  if (slot.status !== "SKIPPED" || slot.landingId) throw new Error("Solo se puede reactivar una fecha omitida sin artículo.");
  await prisma.blogPublication.update({ where: { id }, data: { status: "PLANNED", attempts: 0, lastError: "" } });
  revalidatePath("/blog/calendario");
}

export async function retryBlogPreparation(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  if (slot.status !== "FAILED" || slot.landingId) throw new Error("El artículo existente debe corregirse desde el editor.");
  await prisma.blogPublication.updateMany({ where: { id, status: "FAILED", landingId: null }, data: { status: "PLANNED", attempts: 0, lastError: "" } });
  revalidatePath("/blog/calendario");
}

/** Reserva más fechas después del último día planificado; el relay escribe un artículo por fecha. */
export async function addBlogDays(formData: FormData) {
  const clientId = await pcMidiClient(formData);
  const days = z.coerce.number().int().min(1).max(30).parse(formData.get("days"));
  const tomorrow = shiftDate(argentinaDate(), 1);
  const last = await prisma.blogPublication.findFirst({ where: { clientId }, orderBy: { scheduledDate: "desc" }, select: { scheduledDate: true } });
  const lastDay = last?.scheduledDate.toISOString().slice(0, 10);
  const start = lastDay && lastDay >= tomorrow ? shiftDate(lastDay, 1) : tomorrow;
  await prisma.$transaction(async (tx) => {
    for (let offset = 0; offset < days; offset++) {
      const scheduledDate = dateOnly(shiftDate(start, offset));
      await tx.blogPublication.upsert({ where: { clientId_scheduledDate: { clientId, scheduledDate } }, create: { clientId, scheduledDate }, update: {} });
    }
  }, { timeout: 30000 });
  revalidatePath("/blog/calendario");
}

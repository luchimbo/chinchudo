"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { argentinaDate, dateOnly, shiftDate } from "@/lib/blog-calendar";
import { getSetting, setSetting } from "@/lib/settings";
import { checkInitialBlogBatch } from "@/lib/blog-batch";
import { inspectBlogArticle } from "@/lib/blog-evidence";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";

async function pcMidiClient(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("Cliente inválido.");
  return id;
}

export async function prepareBlogBatch(formData: FormData) {
  const clientId = await pcMidiClient(formData);
  const key = `blog_daily_schedule:${clientId}`;
  let config: Record<string, any> = {};
  try { config = JSON.parse(await getSetting(key) || "{}"); } catch { /* Configuración inicial. */ }
  if (config.enabled) throw new Error("Apagá la publicación diaria antes de preparar una nueva tanda inicial.");
  const start = shiftDate(argentinaDate(), 1);
  await prisma.$transaction(async (tx) => {
    for (let offset = 0; offset < 14; offset++) {
      const scheduledDate = dateOnly(shiftDate(start, offset));
      await tx.blogPublication.upsert({ where: { clientId_scheduledDate: { clientId, scheduledDate } }, create: { clientId, scheduledDate }, update: {} });
    }
    const value = JSON.stringify({ ...config, enabled: false, preparing: true, batchStart: start, reviewedBatchAt: null, reviewedFingerprint: null, horizonDays: 14 });
    await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }, { timeout: 30000 });
  revalidatePath("/blog/calendario");
}

export async function confirmBlogBatchReview(formData: FormData) {
  const clientId = await pcMidiClient(formData);
  if (formData.get("reviewed") !== "on") throw new Error("Confirmá que revisaste los 14 borradores.");
  const key = `blog_daily_schedule:${clientId}`;
  const config = JSON.parse(await getSetting(key) || "{}");
  if (!config.batchStart) throw new Error("Prepará una tanda primero.");
  const fingerprint = await checkInitialBlogBatch(prisma, clientId, config.batchStart);
  await setSetting(key, JSON.stringify({ ...config, reviewedBatchAt: new Date().toISOString(), reviewedFingerprint: fingerprint }));
  revalidatePath("/blog/calendario");
  revalidatePath("/blog/configuracion");
}

async function editableSlot(id: string, allowMissed = false) {
  const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { client: { select: { slug: true } } } });
  if (!slot || slot.client.slug !== "pcmidi") throw new Error("Fecha editorial no encontrada.");
  await assertClientAccess(prisma, slot.clientId);
  if (slot.scheduledDate.toISOString().slice(0, 10) <= argentinaDate() && !(allowMissed && ["SKIPPED", "FAILED"].includes(slot.status) && slot.landingId)) throw new Error("Solo se pueden modificar fechas futuras.");
  if (["PUBLISHING", "PUBLISHED"].includes(slot.status)) throw new Error("Este artículo ya está en publicación.");
  return slot;
}

export async function addBlogTopic(formData: FormData) {
  const clientId = z.string().min(1).parse(formData.get("clientId"));
  const keyword = z.string().trim().min(3).max(160).parse(formData.get("keyword"));
  const intent = z.enum(["educational", "decision"]).parse(formData.get("intent") || "educational");
  await assertClientAccess(prisma, clientId);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("El calendario editorial solo está disponible para PC MIDI.");
  const exists = await prisma.seedTopic.findFirst({ where: { clientId, keyword: { equals: keyword, mode: "insensitive" } }, select: { id: true } });
  if (!exists) await prisma.seedTopic.create({ data: { clientId, keyword, intent } });
  revalidatePath("/blog/calendario");
}

export async function updateBlogExclusions(formData: FormData) {
  const clientId = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, clientId);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("Cliente inválido.");
  const terms = z.string().max(4000).parse(formData.get("terms") ?? "").split(/\r?\n/).map((term) => term.trim()).filter(Boolean).slice(0, 50);
  await setSetting(`blog_editorial_exclusions:${clientId}`, JSON.stringify([...new Set(terms)]));
  revalidatePath("/blog/calendario");
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

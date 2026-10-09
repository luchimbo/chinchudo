"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { argentinaDate, dateOnly, shiftDate } from "@/lib/blog-calendar";
import { businessTimezone, localDay } from "@/lib/business-analysis";
import { inspectBlogArticle } from "@/lib/blog-evidence";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";
import { relayFetch } from "@/lib/relay-client";

export async function publishCalendarArticle(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    z.string().min(1).parse(id);
    const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { landing: true } });
    if (!slot?.landing) return { ok: false, error: "Artículo no encontrado. Recargá el calendario." };
    await assertClientAccess(prisma, slot.clientId);
    if (slot.requiresApproval) return { ok: false, error: "Aprobá el borrador antes de publicarlo." };
    if (!["READY", "FAILED"].includes(slot.status)) return { ok: false, error: "El artículo no está listo para publicar. Recargá el calendario." };
    const response = await relayFetch("/blog/publish", {
      method: "POST", signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ id, clientId: slot.clientId, expectedUpdatedAt: slot.updatedAt.toISOString() }),
    });
    const result = await response.json();
    if (response.status !== 202 || !result.accepted) return { ok: false, error: result.error || "No se pudo iniciar la publicación. Reintentá." };
    revalidatePath("/blog");
    revalidatePath("/blog/calendario");
    revalidatePath(`/blog/articulos/${slot.landing.id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo iniciar la publicación. Verificá tu acceso y la conexión con el agente local, y reintentá." };
  }
}

export async function approveAnalysisArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { landing: true } });
  if (!slot?.landing || !slot.analysisRunId || !slot.requiresApproval) throw new Error("Borrador no encontrado.");
  await assertClientAccess(prisma, slot.clientId);
  if (["PUBLISHED", "PUBLISHING"].includes(slot.status)) throw new Error("El artículo ya está en publicación.");
  const content = JSON.parse(slot.landing.htmlContent);
  const quality = await inspectBlogArticle(prisma, slot.clientId, content, slot.landing.id);
  const issues = quality.checks.filter(c => c.level === "error");
  if (issues.length) throw new Error(`Corregí el artículo antes de aprobarlo: ${issues.map(c => c.message).join(" · ")}`);
  await prisma.$transaction(async tx => {
    const updated = await tx.blogPublication.updateMany({ where: { id, requiresApproval: true, status: { in: ["READY", "FAILED"] }, landing: { updatedAt: slot.landing!.updatedAt } }, data: { requiresApproval: false, approvedAt: new Date(), status: "READY", lastError: "" } });
    if (!updated.count) throw new Error("El artículo cambió durante la revisión. Recargá la página.");
    await tx.landing.update({ where: { id: slot.landing!.id }, data: { status: "APPROVED" } });
  });
  revalidatePath("/blog"); revalidatePath("/blog/calendario"); revalidatePath(`/blog/articulos/${slot.landing.id}`);
}

async function pcMidiClient(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("Cliente inválido.");
  return id;
}

async function editableSlot(id: string, allowMissed = false) {
  const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { client: { select: { slug: true, responsePolicy: true } } } });
  if (!slot) throw new Error("Fecha editorial no encontrada.");
  await assertClientAccess(prisma, slot.clientId);
  if (slot.scheduledDate.toISOString().slice(0, 10) <= localDay(new Date(), businessTimezone(slot.client.responsePolicy)) && !(slot.analysisRunId && slot.requiresApproval) && !(allowMissed && ["SKIPPED", "FAILED"].includes(slot.status) && slot.landingId)) throw new Error("Solo se pueden modificar fechas futuras.");
  if (["PUBLISHING", "PUBLISHED"].includes(slot.status)) throw new Error("Este artículo ya está en publicación.");
  return slot;
}

export async function rescheduleBlogArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const target = z.string().parse(formData.get("scheduledDate"));
  const scheduledDate = dateOnly(target);
  const slot = await editableSlot(id, true);
  if (target <= localDay(new Date(), businessTimezone(slot.client.responsePolicy))) throw new Error("Elegí una fecha futura.");
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
    await tx.blogPublication.update({ where: { id }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), scheduledDate, status: quality.publishable ? "READY" : "FAILED", attempts: quality.publishable ? 0 : 3, lastError: quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ") } });
  });
  revalidatePath("/blog/calendario");
}

export async function replaceBlogArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  await prisma.$transaction(async (tx) => {
    if (slot.landingId) await tx.landing.update({ where: { id: slot.landingId }, data: { status: "ARCHIVED" } });
    await tx.blogPublication.update({ where: { id }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), landingId: null, status: "PLANNED", attempts: 0, lastError: "" } });
  });
  if (slot.analysisRunId) await requeueAnalysis(slot.analysisRunId, slot.clientId);
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
  await prisma.blogPublication.update({ where: { id }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), status: "PLANNED", attempts: 0, lastError: "" } });
  if (slot.analysisRunId) await requeueAnalysis(slot.analysisRunId, slot.clientId);
  revalidatePath("/blog/calendario");
}

export async function retryBlogPreparation(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  if (slot.status !== "FAILED" || slot.landingId) throw new Error("El artículo existente debe corregirse desde el editor.");
  await prisma.blogPublication.updateMany({ where: { id, status: "FAILED", landingId: null }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), status: "PLANNED", attempts: 0, lastError: "" } });
  if (slot.analysisRunId) await requeueAnalysis(slot.analysisRunId, slot.clientId);
  revalidatePath("/blog/calendario");
}

async function requeueAnalysis(runId: string, clientId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId} FOR UPDATE`;
    const active = await tx.businessAnalysisRun.findFirst({ where: { clientId, status: { in: ["QUEUED", "RUNNING"] } } });
    if (active && active.id !== runId) throw new Error("Esperá a que termine el análisis activo y reintentá.");
    await tx.businessAnalysisRun.updateMany({ where: { id: runId, clientId, status: { notIn: ["QUEUED", "RUNNING"] } }, data: { status: "QUEUED", attempts: 0, errors: [], finishedAt: null } });
  });
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

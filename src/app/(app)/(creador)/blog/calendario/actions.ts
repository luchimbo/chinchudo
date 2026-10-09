"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { argentinaDate, dateOnly, shiftDate } from "@/lib/blog-calendar";
import { businessTimezone, localDay } from "@/lib/business-analysis";
import { inspectBlogArticle } from "@/lib/blog-evidence";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";
import { relayFetch } from "@/lib/relay-client";

export type RescheduleFormState = { error: string | null };
class CalendarValidationError extends Error {}
class CalendarDateConflictError extends Error {}

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
  if (!slot) throw new CalendarValidationError("Fecha editorial no encontrada.");
  await assertClientAccess(prisma, slot.clientId);
  if (slot.scheduledDate.toISOString().slice(0, 10) <= localDay(new Date(), businessTimezone(slot.client.responsePolicy)) && !(slot.analysisRunId && slot.requiresApproval) && !(allowMissed && ["SKIPPED", "FAILED"].includes(slot.status) && slot.landingId)) throw new CalendarValidationError("Solo se pueden modificar fechas futuras.");
  if (["PUBLISHING", "PUBLISHED"].includes(slot.status)) throw new CalendarValidationError("Este artículo ya está en publicación.");
  return slot;
}

export async function rescheduleBlogArticle(_state: RescheduleFormState, formData: FormData): Promise<RescheduleFormState> {
  const input = z.object({ id: z.string().min(1), scheduledDate: z.string() }).safeParse({ id: formData.get("id"), scheduledDate: formData.get("scheduledDate") });
  if (!input.success) return { error: "Elegí un artículo y una fecha válida." };
  const { id, scheduledDate: target } = input.data;
  try { dateOnly(target); } catch { return { error: "Elegí una fecha válida." }; }
  let clientSlug: string;
  let finalDate = target;
  try {
    const slot = await editableSlot(id, true);
    clientSlug = slot.client.slug;
    if (target <= localDay(new Date(), businessTimezone(slot.client.responsePolicy))) return { error: "Elegí una fecha futura." };
    if (!slot.landingId) return { error: "Esta fecha aún no tiene artículo para mover." };
    if (slot.scheduledDate.toISOString().slice(0, 10) === target) return { error: null };
    const landing = await prisma.landing.findUniqueOrThrow({ where: { id: slot.landingId } });
    let content: Record<string, any>;
    try {
      content = JSON.parse(landing.htmlContent);
      if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error();
    } catch { return { error: "El artículo no tiene una estructura válida. Revisalo desde el editor." }; }
    if (!["educational", "decision"].includes(content.editorial_intent)) return { error: "El artículo no tiene un tipo editorial válido. Revisalo antes de reprogramar." };
    const quality = await inspectBlogArticle(prisma, slot.clientId, content, landing.id);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        finalDate = await prisma.$transaction(async (tx) => {
          const futureSlots = await tx.blogPublication.findMany({
            where: { clientId: slot.clientId, id: { not: id }, scheduledDate: { gte: dateOnly(target) } },
            select: { id: true, scheduledDate: true, landingId: true, status: true, updatedAt: true },
          });
          const byDate = new Map(futureSlots.map(entry => [entry.scheduledDate.toISOString().slice(0, 10), entry]));
          let candidate = target;
          if (editorialIntentForDate(candidate) !== content.editorial_intent) candidate = shiftDate(candidate, 1);
          while (byDate.get(candidate)?.landingId || (byDate.has(candidate) && byDate.get(candidate)!.status !== "PLANNED")) candidate = shiftDate(candidate, 2);
          if (candidate === slot.scheduledDate.toISOString().slice(0, 10)) return candidate;
          const occupied = byDate.get(candidate);
          if (occupied) {
            const removed = await tx.blogPublication.deleteMany({ where: { id: occupied.id, landingId: null, status: "PLANNED", updatedAt: occupied.updatedAt } });
            if (removed.count !== 1) throw new CalendarDateConflictError();
          }
          const changed = await tx.blogPublication.updateMany({
            where: { id, updatedAt: slot.updatedAt, status: slot.status, landingId: landing.id, landing: { updatedAt: landing.updatedAt } },
            data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), scheduledDate: dateOnly(candidate), status: quality.publishable ? "READY" : "FAILED", attempts: quality.publishable ? 0 : 3, lastError: quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ") },
          });
          if (changed.count !== 1) throw new CalendarValidationError("El artículo cambió durante la reprogramación. Recargá el calendario y reintentá.");
          await tx.landing.update({ where: { id: landing.id }, data: { status: "DRAFT", publishedAt: null } });
          return candidate;
        });
        break;
      } catch (error) {
        const conflict = error instanceof CalendarDateConflictError || (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code)));
        if (!conflict) throw error;
        if (attempt === 2) throw new CalendarValidationError("El calendario cambió mientras buscábamos una fecha libre. Reintentá para buscar la próxima disponible.");
      }
    }
    revalidatePath(`/blog/articulos/${landing.id}`);
  } catch (error) {
    if (error instanceof CalendarValidationError) return { error: error.message };
    if (error instanceof Error && ["No autenticado.", "No tenés acceso a este cliente."].includes(error.message)) return { error: error.message };
    console.error("[blog] No se pudo reprogramar el artículo", error);
    return { error: "No se pudo reprogramar el artículo. Reintentá en unos instantes." };
  }
  revalidatePath("/blog");
  revalidatePath("/blog/calendario");
  redirect(`/blog/calendario?client=${encodeURIComponent(clientSlug)}&month=${finalDate.slice(0, 7)}&rescheduled=${encodeURIComponent(id)}&requestedDate=${target}`);
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

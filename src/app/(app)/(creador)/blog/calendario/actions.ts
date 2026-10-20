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
import { nextFreeEditorialDay, withDateHistory } from "@/lib/blog-free-slot.mjs";
import { carryIntent } from "@/lib/blog-intent.mjs";
import { relayFetch } from "@/lib/relay-client";
import type { Prisma } from "@prisma/client";
import { blogLanguage, blogPreferences, editorialCalendarEnabled } from "@/lib/blog-language";
import { dayPlanFrom, hasDayPlan, loadBlogCatalog, ownBrandsFor, validateDayPlan, type BlogDayPlan, type DayPlanInput } from "@/lib/blog-day-plan";

export type RescheduleFormState = { error: string | null };
export type GenerateDateState = { error: string | null; queued: boolean; id?: string; client?: string };

type EditorialClient = { slug: string; name?: string | null; responsePolicy: Prisma.JsonValue };
type DayRequest = { scheduledDate: unknown; language: unknown; hasLanguage: boolean; brief: FormDataEntryValue | null; comparisonOffered: boolean; comparison: boolean } & DayPlanInput;

function dayRequest(formData: FormData, prefix = ""): DayRequest {
  const key = (name: string) => `${prefix}${name}`;
  return {
    scheduledDate: formData.get(key("scheduledDate")), language: formData.get(key("language")), hasLanguage: formData.has(key("language")), brief: formData.get(key("brief")),
    comparisonOffered: formData.has(key("comparisonOffered")), comparison: formData.get(key("comparison")) === "on",
    productId: formData.get(key("productId")) ?? undefined, excludedProductIds: formData.getAll(key("excludedProductIds")),
    competitor: formData.get(key("competitor")) ?? undefined, competitorNotes: formData.get(key("competitorNotes")) ?? undefined,
  };
}

/** Reserva exactamente el día pedido; el worker existente prepara el artículo. */
export async function generateBlogDate(_state: GenerateDateState, formData: FormData): Promise<GenerateDateState> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    await assertClientAccess(prisma, clientId);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true, name: true, responsePolicy: true } });
    if (!editorialCalendarEnabled(client)) return { error: "Configurá el calendario editorial del cliente antes de generar.", queued: false };
    const result = await reserveBlogDate(clientId, client, dayRequest(formData));
    if (result.queued) { revalidatePath("/blog/calendario"); revalidatePath("/blog/articulos"); }
    return result;
  } catch {
    return { error: "No se pudo solicitar el artículo. Verificá tu acceso y reintentá.", queued: false };
  }
}

export type WeekPlanResult = { day: string; queued: boolean; error: string | null };
export type WeekPlanState = { results: WeekPlanResult[]; error: string | null };
const WEEK_MAX_DAYS = 14;

/** Programa varios días con su plan; cada fila se reserva por separado e informa su resultado. */
export async function planBlogWeek(_state: WeekPlanState, formData: FormData): Promise<WeekPlanState> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    await assertClientAccess(prisma, clientId);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true, name: true, responsePolicy: true } });
    if (!editorialCalendarEnabled(client)) return { results: [], error: "Configurá el calendario editorial del cliente antes de programar." };
    const rows = z.coerce.number().int().min(1).max(WEEK_MAX_DAYS).parse(formData.get("rows"));
    const catalog = await loadBlogCatalog(prisma, clientId);
    const results: WeekPlanResult[] = [];
    for (let index = 0; index < rows; index++) {
      if (formData.get(`day${index}.include`) !== "on") continue;
      const request = dayRequest(formData, `day${index}.`);
      const result = await reserveBlogDate(clientId, client, request, catalog);
      results.push({ day: String(request.scheduledDate || ""), queued: result.queued, error: result.error });
    }
    if (results.some(result => result.queued)) { revalidatePath("/blog/calendario"); revalidatePath("/blog/articulos"); }
    return { results, error: results.length ? null : "Elegí al menos un día para programar." };
  } catch {
    return { results: [], error: "No se pudo programar la semana. Verificá tu acceso y reintentá." };
  }
}

async function reserveBlogDate(clientId: string, client: EditorialClient, input: DayRequest, catalog?: Awaited<ReturnType<typeof loadBlogCatalog>>): Promise<GenerateDateState> {
  try {
    if (input.hasLanguage && !["es", "en", "de"].includes(String(input.language))) return { error: "Elegí español, inglés o alemán.", queued: false };
    const language = blogLanguage(input.language, blogPreferences(client.responsePolicy).language);
    let scheduledDate: Date;
    try { scheduledDate = dateOnly(String(input.scheduledDate || "")); }
    catch { return { error: "Elegí una fecha válida.", queued: false }; }
    const day = scheduledDate.toISOString().slice(0, 10);
    if (day <= localDay(new Date(), businessTimezone(client.responsePolicy))) {
      return { error: "Elegí un día posterior a hoy.", queued: false };
    }
    const brief = parseBrief(input.brief);
    if (brief === null) return { error: `La consigna admite hasta ${BRIEF_MAX} caracteres.`, queued: false };
    const decisionDay = editorialIntentForDate(day) === "decision";
    let plan: BlogDayPlan = {};
    if (hasDayPlan(input)) {
      // El catálogo solo se consulta cuando el operador eligió productos o rival.
      const context = catalog ?? await loadBlogCatalog(prisma, clientId);
      const checked = validateDayPlan(input, { ...context, ownBrands: ownBrandsFor(client.name ?? undefined, context.products), decisionDay });
      if ("error" in checked) return { error: checked.error, queued: false };
      plan = checked.plan;
    }
    // La restricción única evita sobrescribir artículos incluso con pedidos simultáneos.
    // Las comparativas son artículos para elegir: solo en días de esa intención.
    // Un rival elegido fuerza la comparativa; sin rival, la consigna manda y no hay comparativa automática.
    const comparison = !!plan.competitor || (!brief && decisionDay
      && (input.comparisonOffered ? input.comparison : blogPreferences(client.responsePolicy).comparisons));
    const preparation = { language, comparison, ...(brief ? { brief } : {}), ...plan };
    const created = await prisma.blogPublication.createMany({ data: [{ clientId, scheduledDate, preparation }], skipDuplicates: true });
    if (!created.count) {
      // Con la publicación automática, los próximos días ya están reservados
      // vacíos. Mientras el agente no empezó a escribirlos se pueden completar.
      const reserved = await prisma.blogPublication.findUnique({ where: { clientId_scheduledDate: { clientId, scheduledDate } } });
      const phase = reserved?.preparation && typeof reserved.preparation === "object" && !Array.isArray(reserved.preparation) ? (reserved.preparation as Record<string, unknown>).phase : undefined;
      const waiting = reserved && reserved.status === "PLANNED" && !reserved.landingId && !reserved.analysisRunId && (phase === undefined || phase === "WAITING");
      if (!waiting) return { error: "Este día ya tiene un artículo o se está preparando. Elegí otra fecha o usá «Generar otro artículo» desde el día.", queued: false };
      const updated = await prisma.blogPublication.updateMany({ where: { id: reserved.id, status: "PLANNED", landingId: null, updatedAt: reserved.updatedAt }, data: { preparation: { ...preparation, phase: "WAITING" } } });
      if (!updated.count) return { error: "El agente empezó a preparar este día. Elegí otra fecha o usá «Generar otro artículo».", queued: false };
    }
    const slot = await prisma.blogPublication.findUniqueOrThrow({ where: { clientId_scheduledDate: { clientId, scheduledDate } }, select: { id: true } });
    return { error: null, queued: true, id: slot.id, client: client.slug };
  } catch {
    return { error: "No se pudo solicitar el artículo. Verificá tu acceso y reintentá.", queued: false };
  }
}
const BRIEF_MAX = 500;
/** Consigna opcional del operador: "" sin consigna, null si es demasiado larga. */
function parseBrief(value: FormDataEntryValue | null): string | null {
  const brief = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return brief.length > BRIEF_MAX ? null : brief;
}
class CalendarValidationError extends Error {}
class CalendarDateConflictError extends Error {}
function waitingPreparation(value: Prisma.JsonValue | null, brief?: string): Prisma.InputJsonValue {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const nextBrief = brief ?? (typeof metadata.brief === "string" ? metadata.brief : "");
  // El plan del día (producto, exclusiones, rival) sobrevive a reintentos y reemplazos.
  const plan = dayPlanFrom(metadata);
  return carryIntent(metadata, { phase: "WAITING", ...(["es", "en", "de"].includes(String(metadata.language)) ? { language: String(metadata.language) } : {}), ...(nextBrief ? { brief: nextBrief, comparison: false } : typeof metadata.comparison === "boolean" ? { comparison: metadata.comparison } : {}), ...plan, ...(plan.competitor ? { comparison: true } : {}) }) as Prisma.InputJsonValue;
}

export async function publishCalendarArticle(id: string): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    z.string().min(1).parse(id);
    const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { landing: true } });
    if (!slot?.landing) return { ok: false, error: "Artículo no encontrado. Recargá el calendario." };
    await assertClientAccess(prisma, slot.clientId);
    if (slot.requiresApproval) return { ok: false, error: "Aprobá el borrador antes de publicarlo." };
    if (!["READY", "FAILED"].includes(slot.status)) return { ok: false, error: "El artículo no está listo para publicar. Recargá el calendario." };
    let response: Response;
    try { response = await relayFetch("/blog/publish", {
      method: "POST", signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ id, clientId: slot.clientId, expectedUpdatedAt: slot.updatedAt.toISOString() }),
    }); } catch { return { ok: false, error: "No se pudo conectar con el agente local. Revisá la conexión y reintentá.", code: "CONNECTION" }; }
    const result = await response.json();
    if (response.status !== 202 || !result.accepted) return { ok: false, error: result.error || "No se pudo iniciar la publicación. Reintentá." };
    revalidatePath("/blog"); revalidatePath("/blog/articulos");
    revalidatePath("/blog/calendario");
    revalidatePath(`/blog/articulos/${slot.landing.id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo iniciar la publicación. Verificá tu acceso y la conexión con el agente local, y reintentá." };
  }
}

export async function retryBlogDeployment(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { landing: true } });
    if (!slot?.landing) return { ok: false, error: "Artículo no encontrado." };
    await assertClientAccess(prisma, slot.clientId);
    if (slot.status !== "PUBLISHED" || !slot.needsDeploy || slot.requiresApproval || slot.errorCode !== "DEPLOYMENT_FAILED") return { ok: false, error: "Esta actualización no admite un reintento. Revisá el artículo." };
    const updated = await prisma.blogPublication.updateMany({ where: { id, clientId: slot.clientId, status: "PUBLISHED", needsDeploy: true, updatedAt: slot.updatedAt, errorCode: "DEPLOYMENT_FAILED" }, data: { revisionAttempts: 0, lastError: "", errorCode: "" } });
    if (!updated.count) return { ok: false, error: "El artículo cambió. Recargá el calendario." };
    revalidatePath("/blog/calendario"); revalidatePath("/blog/articulos");
    return { ok: true };
  } catch { return { ok: false, error: "No se pudo reintentar la actualización. Verificá tu acceso y la conexión." }; }
}

export async function approveAnalysisArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await prisma.blogPublication.findUnique({ where: { id }, include: { landing: true } });
  // Requieren aprobación los borradores del análisis comercial y las comparativas con rival elegido.
  if (!slot?.landing || !(slot.analysisRunId || dayPlanFrom(slot.preparation).competitor) || !slot.requiresApproval) throw new Error("Borrador no encontrado.");
  await assertClientAccess(prisma, slot.clientId);
  if (["PUBLISHED", "PUBLISHING"].includes(slot.status)) throw new Error("El artículo ya está en publicación.");
  const content = JSON.parse(slot.landing.htmlContent);
  const quality = await inspectBlogArticle(prisma, slot.clientId, content, slot.landing.id);
  const issues = quality.checks.filter(c => c.level === "error");
  if (issues.length) throw new Error(`Corregí el artículo antes de aprobarlo: ${issues.map(c => c.message).join(" · ")}`);
  await prisma.$transaction(async tx => {
    const updated = await tx.blogPublication.updateMany({ where: { id, requiresApproval: true, status: { in: ["READY", "FAILED"] }, landing: { updatedAt: slot.landing!.updatedAt } }, data: { requiresApproval: false, approvedAt: new Date(), status: "READY", lastError: "", errorCode: "" } });
    if (!updated.count) throw new Error("El artículo cambió durante la revisión. Recargá la página.");
    await tx.landing.update({ where: { id: slot.landing!.id }, data: { status: "APPROVED" } });
  });
  revalidatePath("/blog"); revalidatePath("/blog/articulos"); revalidatePath("/blog/calendario"); revalidatePath(`/blog/articulos/${slot.landing.id}`);
}

async function editorialClient(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { slug: true, responsePolicy: true } });
  if (!editorialCalendarEnabled(client)) throw new Error("Cliente inválido.");
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
          const candidate = nextFreeEditorialDay({ from: target, intent: content.editorial_intent, isTaken: (day) => { const entry = byDate.get(day); return !!entry && (!!entry.landingId || entry.status !== "PLANNED"); } });
          if (candidate === slot.scheduledDate.toISOString().slice(0, 10)) return candidate;
          const occupied = byDate.get(candidate);
          if (occupied) {
            const removed = await tx.blogPublication.deleteMany({ where: { id: occupied.id, landingId: null, status: "PLANNED", updatedAt: occupied.updatedAt } });
            if (removed.count !== 1) throw new CalendarDateConflictError();
          }
          const changed = await tx.blogPublication.updateMany({
            where: { id, updatedAt: slot.updatedAt, status: slot.status, landingId: landing.id, landing: { updatedAt: landing.updatedAt } },
            data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), scheduledDate: dateOnly(candidate), preparation: withDateHistory(slot.preparation, { from: slot.scheduledDate.toISOString().slice(0, 10), to: candidate, reason: "reschedule" }) as Prisma.InputJsonObject, status: quality.publishable ? "READY" : "FAILED", attempts: quality.publishable ? 0 : 3, lastError: quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · "), errorCode: quality.publishable ? "" : "QUALITY_BLOCKED" },
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
  revalidatePath("/blog"); revalidatePath("/blog/articulos");
  revalidatePath("/blog/calendario");
  redirect(`/blog/calendario?client=${encodeURIComponent(clientSlug)}&month=${finalDate.slice(0, 7)}&rescheduled=${encodeURIComponent(id)}&requestedDate=${target}`);
}

export async function replaceBlogArticle(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const brief = formData.has("brief") ? parseBrief(formData.get("brief")) : undefined;
  if (brief === null) throw new CalendarValidationError(`La consigna admite hasta ${BRIEF_MAX} caracteres.`);
  const slot = await editableSlot(id);
  await prisma.$transaction(async (tx) => {
    if (slot.analysisRunId) await requeueAnalysis(tx, slot.analysisRunId, slot.clientId, slot.client.slug === "pcmidi");
    const changed = await tx.blogPublication.updateMany({ where: { id, status: slot.status, updatedAt: slot.updatedAt, landingId: slot.landingId }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), landingId: null, status: "PLANNED", attempts: 0, lastError: "", errorCode: "", preparation: waitingPreparation(slot.preparation, brief) } });
    if (!changed.count) throw new CalendarValidationError("La fecha cambió. Recargá el calendario.");
    if (slot.landingId) await tx.landing.update({ where: { id: slot.landingId }, data: { status: "ARCHIVED" } });
  });
  revalidatePath("/blog/calendario");
}

export async function skipBlogDate(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  await prisma.$transaction(async (tx) => {
    const changed = await tx.blogPublication.updateMany({ where: { id, status: slot.status, updatedAt: slot.updatedAt, landingId: slot.landingId }, data: { landingId: null, status: "SKIPPED", lastError: "Fecha omitida por el operador.", errorCode: "" } });
    if (!changed.count) throw new CalendarValidationError("La fecha cambió. Recargá el calendario.");
    if (slot.landingId) await tx.landing.update({ where: { id: slot.landingId }, data: { status: "ARCHIVED" } });
  });
  revalidatePath("/blog/calendario");
}

export async function restoreBlogDate(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  if (slot.status !== "SKIPPED" || slot.landingId) throw new CalendarValidationError("Solo se puede reactivar una fecha omitida sin artículo.");
  await prisma.$transaction(async tx => {
    if (slot.analysisRunId) await requeueAnalysis(tx, slot.analysisRunId, slot.clientId, slot.client.slug === "pcmidi");
    const changed = await tx.blogPublication.updateMany({ where: { id, status: "SKIPPED", landingId: null, updatedAt: slot.updatedAt }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), status: "PLANNED", attempts: 0, lastError: "", errorCode: "", preparation: waitingPreparation(slot.preparation) } });
    if (!changed.count) throw new CalendarValidationError("La fecha cambió. Recargá el calendario.");
  });
  revalidatePath("/blog/calendario");
}

export async function retryBlogPreparation(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const slot = await editableSlot(id);
  if (slot.status !== "FAILED" || slot.landingId) throw new CalendarValidationError("El artículo existente debe corregirse desde el editor.");
  await prisma.$transaction(async tx => {
    if (slot.analysisRunId) await requeueAnalysis(tx, slot.analysisRunId, slot.clientId, slot.client.slug === "pcmidi");
    const changed = await tx.blogPublication.updateMany({ where: { id, status: "FAILED", landingId: null, updatedAt: slot.updatedAt }, data: { ...(slot.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), status: "PLANNED", attempts: 0, lastError: "", errorCode: "", preparation: waitingPreparation(slot.preparation) } });
    if (!changed.count) throw new CalendarValidationError("La fecha cambió. Recargá el calendario.");
  });
  revalidatePath("/blog/calendario");
}

async function requeueAnalysis(tx: Prisma.TransactionClient, runId: string, clientId: string, rejectActive: boolean) {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId} FOR UPDATE`;
    const active = await tx.businessAnalysisRun.findFirst({ where: { clientId, status: { in: ["QUEUED", "RUNNING"] } } });
    if (active && (active.id !== runId || rejectActive)) throw new CalendarValidationError("Esperá a que termine el análisis activo y reintentá.");
    await tx.businessAnalysisRun.updateMany({ where: { id: runId, clientId, status: { notIn: ["QUEUED", "RUNNING"] } }, data: { status: "QUEUED", attempts: 0, errors: [], finishedAt: null } });
}

/** Las acciones del panel devuelven errores seguros, también en producción. */
export async function requestBlogPreparation(kind: "replace" | "restore" | "retry", id: string, brief?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = z.object({ kind: z.enum(["replace", "restore", "retry"]), id: z.string().min(1) }).safeParse({kind,id});
  if (!input.success) return { ok: false, error: "Elegí una acción válida para el artículo." };
  try {
    const slot = await editableSlot(id);
    if (!editorialCalendarEnabled(slot.client)) return { ok: false, error: "Configurá el calendario editorial del cliente." };
    const data = new FormData(); data.set("id",id);
    if (kind === "replace" && typeof brief === "string") data.set("brief", brief);
    await ({ replace: replaceBlogArticle, restore: restoreBlogDate, retry: retryBlogPreparation }[kind])(data);
    return { ok: true };
  } catch (error) {
    if (error instanceof CalendarValidationError || error instanceof Error && ["No autenticado.","No tenés acceso a este cliente."].includes(error.message)) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo solicitar la preparación. Verificá tu acceso y reintentá." };
  }
}

/**
 * Reserva varios días seguidos; el relay escribe un artículo por fecha, de a uno.
 * Sin fecha de inicio se continúa después del último día planificado.
 * Los días que ya tienen publicación se respetan tal como están.
 */
export async function addBlogDays(formData: FormData) {
  const clientId = await editorialClient(formData);
  const days = z.coerce.number().int().min(1).max(30).parse(formData.get("days"));
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { responsePolicy: true } });
  const preferences = blogPreferences(client.responsePolicy);
  const tomorrow = shiftDate(argentinaDate(), 1);
  const requested = String(formData.get("startDate") || "");
  let start: string;
  if (requested) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) throw new Error("Elegí una fecha de inicio válida.");
    start = requested < tomorrow ? tomorrow : requested;
  } else {
    const last = await prisma.blogPublication.findFirst({ where: { clientId }, orderBy: { scheduledDate: "desc" }, select: { scheduledDate: true } });
    const lastDay = last?.scheduledDate.toISOString().slice(0, 10);
    start = lastDay && lastDay >= tomorrow ? shiftDate(lastDay, 1) : tomorrow;
  }
  const language = formData.has("language") ? blogLanguage(formData.get("language"), preferences.language) : null;
  const comparisons = formData.has("comparisonOffered") ? formData.get("comparison") === "on" : preferences.comparisons;
  const data = Array.from({ length: days }, (_, offset) => {
    const day = shiftDate(start, offset);
    const preparation = language ? { language, comparison: editorialIntentForDate(day) === "decision" && comparisons } : undefined;
    return { clientId, scheduledDate: dateOnly(day), ...(preparation ? { preparation } : {}) };
  });
  await prisma.blogPublication.createMany({ data, skipDuplicates: true });
  revalidatePath("/blog/calendario");
}

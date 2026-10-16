"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentIntent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { dateOnly } from "@/lib/blog-calendar";
import { generateVideoScript } from "@/lib/video-script-generator";
import { findSelectedVideoPersona } from "@/lib/video-persona-selector";
import { proposeWeek } from "@/lib/studio/weekly-plan-generator";
import { REFERENCE_MAX, parseReferenceAccount } from "@/lib/studio/reference-accounts";
import { SCRIPT_FOCUS_INTENT, buildScriptQualityReport, classifyHook, readReelCraftMeta, toRioplatense, withOnScreenCards, type DraftBeat, type HookOption, type ScriptQualityReport } from "@/lib/reel-craft";

export type ActionState = { error: string | null; message?: string };
const ok = (message?: string): ActionState => ({ error: null, message });
const fail = (error: string): ActionState => ({ error });

const INTENTS = ["SALE", "EDUCATION", "USE_CASE", "ENTERTAINMENT"] as const;
const PIECE_TYPES = ["REEL", "CAROUSEL", "STORY"] as const;

function revalidateStudio() {
  for (const step of ["inspiracion", "plan", "guiones", "publicar", "resultados"]) revalidatePath(`/estudio/${step}`);
}

async function pieceWithAccess(id: string) {
  const piece = await prisma.contentIdea.findUniqueOrThrow({ where: { id } });
  await assertClientAccess(prisma, piece.clientId);
  return piece;
}

async function personaFor(clientId: string, productId: string) {
  const [personas, product] = await Promise.all([
    prisma.persona.findMany({ where: { clientId } }),
    prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { brand: { select: { name: true } } } }),
  ]);
  return findSelectedVideoPersona(personas, product);
}

// ── Paso 1: Inspiración ──────────────────────────────────────────────

/** "Usar como idea": convierte una referencia en una pieza para revisar en el plan. */
export async function referenceToIdea(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const trendId = z.string().min(1).parse(formData.get("trendId"));
    const trend = await prisma.trend.findUniqueOrThrow({ where: { id: trendId } });
    if (!trend.clientId) return fail("Referencia sin cliente.");
    await assertClientAccess(prisma, trend.clientId);
    const suggested = trend.suggestedProductId ? await prisma.product.findFirst({ where: { id: trend.suggestedProductId, brand: { clientId: trend.clientId } } }) : null;
    const product = suggested ?? (await prisma.product.findFirst({ where: { brand: { clientId: trend.clientId } }, orderBy: { updatedAt: "desc" } }));
    if (!product) return fail("Cargá al menos un producto para usar referencias.");
    const meta = readReelCraftMeta(trend.metadata);
    const hook = toRioplatense(trend.suggestedAngle || trend.title.replace(/^[\p{L}/ ]{2,30}:\s+/u, "")).text;
    await prisma.contentIdea.create({
      data: {
        clientId: trend.clientId,
        productId: product.id,
        trendId: trend.id,
        intent: "USE_CASE",
        format: trend.viralFormula || meta.formulaName || "Basado en una referencia",
        hook,
        rationale: trend.suggestedAngle ? `Inspirado en: ${trend.title}` : "",
        visualDirection: trend.visualDirection,
        viabilityScore: Math.max(1, Math.min(5, trend.viabilityScore || 3)),
        status: "REVIEW",
        formulaId: meta.formulaId ?? classifyHook(hook)?.id ?? null,
      },
    });
    revalidateStudio();
    return ok("Idea agregada al plan. La encontrás en \"Sin día asignado\".");
  } catch {
    return fail("No se pudo crear la idea. Reintentá.");
  }
}

// ── Paso 2: Plan de la semana ────────────────────────────────────────

export async function proposeWeekAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    const week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("week"));
    await assertClientAccess(prisma, clientId);
    const { created, noDaysLeft } = await proposeWeek({ clientId, week });
    revalidateStudio();
    if (created) return ok(`Propusimos ${created} pieza${created === 1 ? "" : "s"}. Revisalas y aprobá las que te gusten.`);
    return ok(noDaysLeft ? "No quedan días libres en esta semana. Pasá a la semana siguiente con la flecha." : "La semana ya está completa.");
  } catch (err) {
    return fail(err instanceof Error && err.message.startsWith("Cargá") ? err.message : "No se pudo proponer la semana. Reintentá.");
  }
}

export async function addPieceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    await assertClientAccess(prisma, clientId);
    const productId = z.string().min(1).parse(formData.get("productId"));
    const hook = z.string().trim().min(3, "Escribí de qué trata la pieza.").parse(formData.get("hook"));
    const day = String(formData.get("day") || "");
    const pieceType = z.enum(PIECE_TYPES).parse(formData.get("pieceType") || "REEL");
    const intent = z.enum(INTENTS).parse(formData.get("intent") || "USE_CASE");
    const product = await prisma.product.findFirst({ where: { id: productId, brand: { clientId } } });
    if (!product) return fail("Elegí un producto de este cliente.");
    const text = toRioplatense(hook).text;
    await prisma.contentIdea.create({ data: { clientId, productId, intent, format: "Idea propia", hook: text, rationale: "", visualDirection: "", status: "APPROVED", pieceType, plannedFor: day ? dateOnly(day) : null, formulaId: classifyHook(text)?.id ?? null } });
    revalidateStudio();
    return ok("Idea agregada y aprobada.");
  } catch (err) {
    if (err instanceof z.ZodError) return fail(err.issues[0]?.message ?? "Revisá los datos.");
    return fail("No se pudo agregar la idea.");
  }
}

export async function setPieceStatus(id: string, status: "APPROVED" | "DISCARDED" | "REVIEW" | "RECORDED" | "READY_TO_RECORD"): Promise<ActionState> {
  try {
    await pieceWithAccess(id);
    await prisma.contentIdea.update({ where: { id }, data: { status } });
    revalidateStudio();
    return ok();
  } catch {
    return fail("No se pudo cambiar el estado.");
  }
}

export async function movePiece(id: string, day: string | null): Promise<ActionState> {
  try {
    await pieceWithAccess(id);
    await prisma.contentIdea.update({ where: { id }, data: { plannedFor: day ? dateOnly(day) : null } });
    revalidateStudio();
    return ok();
  } catch {
    return fail("No se pudo mover la pieza.");
  }
}

export async function markPublished(id: string, url: string): Promise<ActionState> {
  try {
    await pieceWithAccess(id);
    const parsed = z.string().url("Pegá el link completo de la publicación.").parse(url.trim());
    await prisma.contentIdea.update({ where: { id }, data: { status: "PUBLISHED", publishedUrl: parsed, publishedAt: new Date() } });
    revalidateStudio();
    return ok("Marcada como publicada.");
  } catch (err) {
    if (err instanceof z.ZodError) return fail(err.issues[0]?.message ?? "Link inválido.");
    return fail("No se pudo marcar como publicada.");
  }
}

// ── Paso 3: Guiones ──────────────────────────────────────────────────

export async function writeScriptForPiece(id: string): Promise<ActionState & { scriptId?: string }> {
  try {
    const piece = await pieceWithAccess(id);
    if (piece.status !== "APPROVED") return fail("Aprobá la idea antes de escribir el guion.");
    const persona = await personaFor(piece.clientId, piece.productId);
    if (!persona) return fail("Configurá una persona para este cliente antes de escribir guiones.");
    const scriptId = await generateVideoScript({ contentIdeaId: piece.id, personaId: persona.id, clientId: piece.clientId });
    if (!scriptId) return fail("No se pudo escribir el guion. Revisá la conexión con la IA y reintentá.");
    await prisma.contentIdea.update({ where: { id }, data: { status: "SCRIPT_READY" } });
    revalidateStudio();
    return { error: null, scriptId };
  } catch {
    return fail("No se pudo escribir el guion.");
  }
}

/** Guion rápido desde un producto: escribe el guion y crea la pieza por detrás. */
export async function quickScript(_state: ActionState & { scriptId?: string }, formData: FormData): Promise<ActionState & { scriptId?: string }> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    await assertClientAccess(prisma, clientId);
    const productId = z.string().min(1, "Elegí un producto.").parse(formData.get("productId"));
    const focus = z.enum(["Vender", "Mostrar uso", "Resolver una duda", "Inspirar"]).parse(formData.get("focus"));
    const product = await prisma.product.findFirst({ where: { id: productId, brand: { clientId } } });
    if (!product) return fail("Producto no disponible para este cliente.");
    const persona = await personaFor(clientId, productId);
    if (!persona) return fail("Configurá una persona para este cliente antes de escribir guiones.");
    const scriptId = await generateVideoScript({ productId, personaId: persona.id, clientId, focus });
    if (!scriptId) return fail("No se pudo escribir el guion. Reintentá.");
    const script = await prisma.videoScript.findUniqueOrThrow({ where: { id: scriptId } });
    const report = script.qualityReport as Partial<ScriptQualityReport> | null;
    const piece = await prisma.contentIdea.create({ data: { clientId, productId, intent: SCRIPT_FOCUS_INTENT[focus] as ContentIntent, format: script.hookFormula || "Guion rápido", hook: script.hook, rationale: "", visualDirection: "", status: "SCRIPT_READY", formulaId: report?.hook?.formulaId ?? null } });
    await prisma.videoScript.update({ where: { id: scriptId }, data: { contentIdeaId: piece.id } });
    revalidateStudio();
    return { error: null, scriptId };
  } catch (err) {
    if (err instanceof z.ZodError) return fail(err.issues[0]?.message ?? "Revisá los datos.");
    return fail("No se pudo escribir el guion.");
  }
}

export type ScriptEdit = { scriptId: string; hook: string; hookOnScreen: string; beats: DraftBeat[]; cta: string; caption: string; visualNotes: string };

/** Guarda lo editado en el panel y recalcula la calidad con las mismas reglas que al generar. */
export async function saveScriptEdit(edit: ScriptEdit): Promise<ActionState & { report?: ScriptQualityReport }> {
  try {
    const script = await prisma.videoScript.findUniqueOrThrow({ where: { id: edit.scriptId } });
    if (!script.clientId) return fail("Guion sin cliente.");
    await assertClientAccess(prisma, script.clientId);
    const previous = script.qualityReport as Partial<ScriptQualityReport> | null;
    const options: HookOption[] = previous?.hookOptions ?? [];
    const chosen = options.find((option) => option.spoken === edit.hook);
    const beats = edit.beats.map((beat) => ({ spoken: beat.spoken.trim(), onScreen: beat.onScreen?.trim() || undefined })).filter((beat) => beat.spoken);
    const report = buildScriptQualityReport({ hookOptions: [{ formulaId: chosen?.formulaId ?? null, spoken: edit.hook.trim(), onScreen: edit.hookOnScreen.trim() }], beats: [...beats, { spoken: edit.cta.trim() }], caption: edit.caption });
    const qualityReport = { ...report, hookOptions: [report.hook, ...options.filter((option) => option.spoken !== edit.hook.trim())] };
    await prisma.videoScript.update({
      where: { id: script.id },
      data: {
        hook: edit.hook.trim(),
        bodyText: beats.map((beat) => beat.spoken).join("\n"),
        cta: edit.cta.trim(),
        caption: edit.caption,
        visualCues: withOnScreenCards(edit.visualNotes, report.beatSheet),
        hookFormula: report.hook.formulaId ? `#${report.hook.formulaId} ${report.hook.formulaName}` : "",
        qualityReport: qualityReport as unknown as Prisma.InputJsonValue,
      },
    });
    revalidateStudio();
    return { error: null, message: "Guardado.", report: qualityReport };
  } catch {
    return fail("No se pudo guardar el guion.");
  }
}

/** "Listo para grabar": aprueba el guion (sirve de ejemplo para la persona) y avanza la pieza. */
export async function markScriptReady(scriptId: string): Promise<ActionState> {
  try {
    const script = await prisma.videoScript.findUniqueOrThrow({ where: { id: scriptId } });
    if (!script.clientId) return fail("Guion sin cliente.");
    await assertClientAccess(prisma, script.clientId);
    await prisma.videoScript.update({ where: { id: scriptId }, data: { status: "APPROVED" } });
    if (script.contentIdeaId) await prisma.contentIdea.update({ where: { id: script.contentIdeaId }, data: { status: "READY_TO_RECORD" } });
    revalidateStudio();
    return ok("Listo para grabar.");
  } catch {
    return fail("No se pudo marcar el guion.");
  }
}

export async function discardScript(scriptId: string): Promise<ActionState> {
  try {
    const script = await prisma.videoScript.findUniqueOrThrow({ where: { id: scriptId } });
    if (!script.clientId) return fail("Guion sin cliente.");
    await assertClientAccess(prisma, script.clientId);
    await prisma.videoScript.update({ where: { id: scriptId }, data: { status: "DISCARDED" } });
    if (script.contentIdeaId) await prisma.contentIdea.update({ where: { id: script.contentIdeaId }, data: { status: "APPROVED" } });
    revalidateStudio();
    return ok("Guion descartado. La idea vuelve a \"Para escribir\".");
  } catch {
    return fail("No se pudo descartar el guion.");
  }
}

// ── Cuentas de referencia (ig-viral) ─────────────────────────────────

export async function addReferenceAccountAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const clientId = z.string().min(1).parse(formData.get("clientId"));
    await assertClientAccess(prisma, clientId);
    const platform = z.enum(["INSTAGRAM", "TIKTOK", "YOUTUBE"]).parse(formData.get("platform") || "INSTAGRAM");
    const kind = z.enum(["COMPETENCIA", "AFIN", "FORMATO"]).parse(formData.get("kind") || "COMPETENCIA");
    const parsed = parseReferenceAccount(String(formData.get("account") || ""), platform);
    if (!parsed) return fail("Pegá el link del perfil (no de una publicación) o escribí @usuario.");
    const active = await prisma.referenceAccount.count({ where: { clientId, active: true } });
    if (active >= REFERENCE_MAX) return fail(`Ya tenés ${REFERENCE_MAX} cuentas activas. Pausá alguna antes de sumar otra.`);
    await prisma.referenceAccount.upsert({
      where: { clientId_platform_handle: { clientId, platform: parsed.platform, handle: parsed.handle } },
      create: { clientId, platform: parsed.platform, handle: parsed.handle, url: parsed.url, kind, scanRequestedAt: new Date() },
      update: { active: true, kind, url: parsed.url, scanRequestedAt: new Date() },
    });
    revalidatePath("/estudio/inspiracion");
    return ok(`Agregamos @${parsed.handle}. La leemos en la próxima pasada del radar.`);
  } catch {
    return fail("No se pudo agregar la cuenta.");
  }
}

async function referenceWithAccess(id: string) {
  const account = await prisma.referenceAccount.findUniqueOrThrow({ where: { id } });
  await assertClientAccess(prisma, account.clientId);
  return account;
}

export async function toggleReferenceAccount(id: string): Promise<ActionState> {
  try {
    const account = await referenceWithAccess(id);
    await prisma.referenceAccount.update({ where: { id }, data: { active: !account.active } });
    revalidatePath("/estudio/inspiracion");
    return ok();
  } catch {
    return fail("No se pudo cambiar la cuenta.");
  }
}

export async function removeReferenceAccount(id: string): Promise<ActionState> {
  try {
    await referenceWithAccess(id);
    await prisma.referenceAccount.delete({ where: { id } });
    revalidatePath("/estudio/inspiracion");
    return ok();
  } catch {
    return fail("No se pudo quitar la cuenta.");
  }
}

/** "Leer ahora": marca las cuentas para la próxima pasada del agente (reference-scan). */
export async function requestReferenceScan(clientId: string): Promise<ActionState> {
  try {
    await assertClientAccess(prisma, clientId);
    const { count } = await prisma.referenceAccount.updateMany({ where: { clientId, active: true }, data: { scanRequestedAt: new Date() } });
    revalidatePath("/estudio/inspiracion");
    return ok(count ? `Pedimos leer ${count} cuenta${count === 1 ? "" : "s"}. Los videos aparecen cuando termine la lectura.` : "No hay cuentas activas para leer.");
  } catch {
    return fail("No se pudo pedir la lectura.");
  }
}

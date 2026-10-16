import type { ContentIntent, Product } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchChatCompletion, resolveLLMConfig } from "@/lib/llm-provider";
import { policyInstructions } from "@/lib/response-policy";
import { candidateFormulas, formulaPromptBlock, getFormula, scoreHook, toRioplatense, type HookFormula, type SwipeSummary } from "@/lib/reel-craft";
import { ARGENTINE_SPANISH_RULES, SCRIPT_SYSTEM_MESSAGE } from "@/lib/script-voice";
import { argentinaDate, dateOnly } from "@/lib/blog-calendar";
import { fallbackAngles } from "@/lib/content-idea-generator";
import { loadSwipeSummary } from "./sources";
import { loadOwnBestFormulas } from "./results";
import { weekBounds } from "./week";

export type PlannedPiece = {
  day: string;
  pieceType: "REEL" | "CAROUSEL" | "STORY";
  productId: string;
  formulaId: number | null;
  intent: ContentIntent;
  format: string;
  hook: string;
  rationale: string;
  visualDirection: string;
  hookScore: number;
};

const INTENTS: ContentIntent[] = ["SALE", "EDUCATION", "USE_CASE", "ENTERTAINMENT"];
const PIECE_TYPES = new Set(["REEL", "CAROUSEL", "STORY"]);
// Reparto por defecto de ig-plan: el reel es el formato principal, un carrusel para guardar y una historia para conversar.
const DEFAULT_MIX: PlannedPiece["pieceType"][] = ["REEL", "CAROUSEL", "REEL", "STORY", "REEL"];
const DEFAULT_DAY_INDEXES = [0, 1, 2, 3, 4];
const RECENT_DAYS = 14;

/**
 * Fórmulas candidatas en orden de preferencia: lo que le funcionó al propio
 * cliente (ig-audit), después lo que funciona en el rubro (ig-viral) y por
 * último el orden fijo por intención.
 */
export function rankedFormulasFor(intent: ContentIntent, swipe: SwipeSummary | null, ownBest: number[] = []): HookFormula[] {
  const fromOwn = ownBest.map((id) => getFormula(id)).filter((formula): formula is HookFormula => Boolean(formula));
  const fromSwipe = (swipe?.formulas ?? []).map((entry) => getFormula(entry.formulaId)).filter((formula): formula is HookFormula => Boolean(formula));
  const fallback = candidateFormulas(intent, null, 6);
  return Array.from(new Map([...fromOwn, ...fromSwipe, ...fallback].map((formula) => [formula.id, formula])).values());
}

/** Reparte piezas en los días libres de la semana sin repetir producto. */
export function fallbackPlan({ days, freeDayIndexes, products, swipe, count }: { days: string[]; freeDayIndexes: number[]; products: Pick<Product, "id" | "name">[]; swipe: SwipeSummary | null; count: number }): PlannedPiece[] {
  const slots = freeDayIndexes.slice(0, count);
  return slots.map((dayIndex, index) => {
    const intent = INTENTS[index % INTENTS.length];
    const product = products[index % Math.max(products.length, 1)];
    // Ganchos base del generador de ideas: usan el nombre del producto, no ejemplos de otro rubro.
    const angles = product ? fallbackAngles(product, intent, []) : [];
    const preferred = new Set(rankedFormulasFor(intent, swipe).slice(0, 3).map((formula) => formula.id));
    const angle = angles.find((candidate) => candidate.formulaId && preferred.has(candidate.formulaId)) ?? angles[index % Math.max(angles.length, 1)];
    return {
      day: days[dayIndex],
      pieceType: DEFAULT_MIX[index % DEFAULT_MIX.length],
      productId: product?.id ?? "",
      formulaId: angle?.formulaId ?? null,
      intent,
      format: angle?.format ?? "Demostración",
      hook: angle?.hook ?? "",
      rationale: angle?.rationale ?? "",
      visualDirection: angle?.visualDirection ?? "",
      hookScore: angle ? scoreHook(angle.hook).score : 0,
    };
  }).filter((piece) => piece.productId && piece.hook);
}

function cleanPiece(raw: any, days: string[], productIds: Set<string>): PlannedPiece | null {
  const dayIndex = Number(raw?.dayIndex);
  const productId = String(raw?.productId || "");
  const hookRaw = String(raw?.hook || "").trim();
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6 || !productIds.has(productId) || !hookRaw) return null;
  const formula = getFormula(Number(raw?.formulaId) || null);
  const intent = INTENTS.includes(raw?.intent) ? (raw.intent as ContentIntent) : "USE_CASE";
  const pieceType = PIECE_TYPES.has(raw?.pieceType) ? raw.pieceType : "REEL";
  const hook = toRioplatense(hookRaw).text;
  return {
    day: days[dayIndex],
    pieceType,
    productId,
    formulaId: formula?.id ?? null,
    intent,
    format: String(raw?.format || formula?.name || "Reel").slice(0, 120),
    hook,
    rationale: toRioplatense(String(raw?.rationale || "")).text.slice(0, 400),
    visualDirection: toRioplatense(String(raw?.visualDirection || "")).text.slice(0, 400),
    hookScore: scoreHook(hook).score,
  };
}

/**
 * ig-plan: propone la semana (3 a 5 piezas) en los días que todavía están libres
 * y las guarda como piezas en revisión. Devuelve cuántas creó.
 */
export async function proposeWeek({ clientId, week, count = 4 }: { clientId: string; week: string; count?: number }): Promise<{ created: number; usedFallback: boolean; noDaysLeft?: boolean }> {
  const { days, startDate, endDate } = weekBounds(week);
  const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const [client, products, existing, recent, { summary }, ownBest] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.product.findMany({ where: { brand: { clientId } }, include: { brand: true }, take: 60, orderBy: { updatedAt: "desc" } }),
    prisma.contentIdea.findMany({ where: { clientId, plannedFor: { gte: startDate, lte: endDate }, status: { not: "DISCARDED" } }, select: { plannedFor: true } }),
    prisma.contentIdea.findMany({ where: { clientId, createdAt: { gte: recentSince } }, select: { productId: true, hook: true }, take: 40 }),
    loadSwipeSummary(clientId),
    loadOwnBestFormulas(clientId),
  ]);
  if (!products.length) throw new Error("Cargá productos para poder planificar la semana.");

  const takenDays = new Set(existing.map((idea) => idea.plannedFor?.toISOString().slice(0, 10)));
  // Solo días libres desde hoy: no tiene sentido planificar días que ya pasaron.
  const today = argentinaDate();
  const freeDayIndexes = DEFAULT_DAY_INDEXES.concat([5, 6]).filter((index) => !takenDays.has(days[index]) && days[index] >= today);
  const target = Math.min(count, freeDayIndexes.length);
  if (target === 0) return { created: 0, usedFallback: false, noDaysLeft: true };

  const recentProducts = new Set(recent.map((idea) => idea.productId));
  const fresh = [...products.filter((product) => !recentProducts.has(product.id)), ...products.filter((product) => recentProducts.has(product.id))];
  const catalog = fresh.slice(0, 30);
  const productIds = new Set(catalog.map((product) => product.id));

  let pieces: PlannedPiece[] = [];
  let usedFallback = false;
  const llm = resolveLLMConfig(client);
  if (llm.apiKey) {
    const formulas = rankedFormulasFor("USE_CASE", summary, ownBest).slice(0, 6);
    const ownText = ownBest.length ? `Lo que mejor le funcionó a ${client.name} en sus propias publicaciones: ${ownBest.map((id) => getFormula(id)?.name).filter(Boolean).join(", ")}.
` : "";
    const swipeText = summary.formulas.length
      ? summary.formulas.slice(0, 4).map((entry) => `- #${entry.formulaId} ${entry.name}: ${entry.topCount} de las referencias que mejor les fue`).join("\n")
      : "Todavía no hay referencias medidas: usá fórmulas probadas.";
    const prompt = `${ARGENTINE_SPANISH_RULES}

Armá el plan de contenido de la semana para ${client.name} (${client.description}). Contexto: ${policyInstructions(client).text}
Proponé exactamente ${target} piezas, una por día, solo en estos días (dayIndex 0 = lunes): ${freeDayIndexes.slice(0, target + 2).join(", ")}.
Mezcla sugerida: mayoría reels, un carrusel para guardar y una historia para conversar.
No repitas producto en la semana y evitá estos ganchos recientes: ${recent.slice(0, 10).map((idea) => `"${idea.hook}"`).join("; ") || "ninguno"}.

${ownText}Lo que funciona en el rubro:
${swipeText}

Tipos de gancho disponibles:
${formulaPromptBlock(formulas)}

Catálogo (usá solo estos ids):
${catalog.map((product) => `${product.id}: ${product.name} (${product.brand.name}) — ${product.category}`).join("\n")}

Reglas: gancho de 5 a 12 palabras, con algo concreto y algo en juego; sin saludo; no inventes precio, stock, garantía ni datos (si falta un número, {{dato}}).
Devolvé JSON: {"pieces":[{"dayIndex":0,"pieceType":"REEL|CAROUSEL|STORY","productId":"","formulaId":0,"intent":"SALE|EDUCATION|USE_CASE|ENTERTAINMENT","format":"","hook":"","rationale":"","visualDirection":""}]}`;
    try {
      const { response } = await fetchChatCompletion(llm, { messages: [{ role: "system", content: SCRIPT_SYSTEM_MESSAGE }, { role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.7, max_tokens: 1800 }, "Los 5 Apostoles - Plan semanal de reels", client);
      if (response.ok) {
        const json = JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}");
        const seenDays = new Set<string>();
        const seenProducts = new Set<string>();
        pieces = (Array.isArray(json.pieces) ? json.pieces : [])
          .map((raw: unknown) => cleanPiece(raw, days, productIds))
          .filter((piece: PlannedPiece | null): piece is PlannedPiece => Boolean(piece) && !takenDays.has(piece!.day))
          .filter((piece: PlannedPiece) => !seenDays.has(piece.day) && !seenProducts.has(piece.productId) && seenDays.add(piece.day) && seenProducts.add(piece.productId))
          .slice(0, target);
      }
    } catch (err) {
      console.error("[Plan semanal] Falló la propuesta con IA, uso el plan base:", err);
    }
  }
  if (!pieces.length) {
    usedFallback = true;
    pieces = fallbackPlan({ days, freeDayIndexes, products: catalog, swipe: summary, count: target });
  }

  await prisma.contentIdea.createMany({
    data: pieces.map((piece) => ({
      clientId,
      productId: piece.productId,
      intent: piece.intent,
      format: piece.format,
      hook: piece.hook,
      rationale: piece.rationale,
      visualDirection: piece.visualDirection,
      viabilityScore: Math.max(1, Math.min(5, Math.round(piece.hookScore / 20))),
      status: "REVIEW",
      pieceType: piece.pieceType,
      plannedFor: dateOnly(piece.day),
      formulaId: piece.formulaId,
    })),
  });
  console.info("[Plan semanal] Piezas propuestas", { clientId, week, created: pieces.length, usedFallback });
  return { created: pieces.length, usedFallback };
}

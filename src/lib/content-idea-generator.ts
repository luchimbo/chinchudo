import type { ContentIntent, Product, Trend } from "@prisma/client";
import { prisma } from "./db";
import { llmHeaders, resolveLLMConfig } from "./llm-provider";

export type EditorialAngle = {
  format: string;
  hook: string;
  rationale: string;
  visualDirection: string;
  viabilityScore: number;
  trendId?: string;
};

const INTENT_LABELS: Record<ContentIntent, string> = {
  SALE: "venta directa y creible",
  EDUCATION: "educacion util",
  USE_CASE: "caso de uso real",
  ENTERTAINMENT: "entretenimiento o humor relevante",
};

function clampScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(1, Math.min(5, Math.round(score))) : 3;
}

function cleanAngle(value: any, fallback: EditorialAngle): EditorialAngle {
  return {
    format: String(value?.format || fallback.format),
    hook: String(value?.hook || fallback.hook),
    rationale: String(value?.rationale || fallback.rationale),
    visualDirection: String(value?.visualDirection || fallback.visualDirection),
    viabilityScore: clampScore(value?.viabilityScore),
    trendId: typeof value?.trendId === "string" ? value.trendId : undefined,
  };
}

export async function generateEditorialAngles({ clientId, productId, intent }: { clientId: string; productId: string; intent: ContentIntent }): Promise<EditorialAngle[]> {
  const [client, product, trends] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.product.findUnique({ where: { id: productId }, include: { brand: true } }),
    prisma.trend.findMany({ where: { clientId, analysisStatus: "ANALYZED", platform: { in: ["TIKTOK", "TIKTOK_HASHTAG", "TIKTOK_CREATIVE_CENTER", "INSTAGRAM", "YOUTUBE", "VIRAL_MARKETING"] }, createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } }, orderBy: [{ viabilityScore: "desc" }, { createdAt: "desc" }], take: 5 }),
  ]);
  if (!client || !product) throw new Error("Producto o cliente no encontrado.");

  const fallback = fallbackAngles(product, intent, trends);
  const llm = resolveLLMConfig(client);
  if (!llm.apiKey) return fallback;

  const trendContext = trends.map((trend) => `- id: ${trend.id}; formato: ${trend.viralFormula}; idea: ${trend.suggestedAngle}; viabilidad: ${trend.viabilityScore}`).join("\n") || "No hay referencias analizadas: usar estructuras evergreen.";
  const prompt = `Genera exactamente 3 angulos de contenido vertical para Argentina. Producto: ${product.name} (${product.brand.name}). Descripcion: ${product.description}. Usos: ${product.useCases}. Intencion: ${INTENT_LABELS[intent]}.\nReferencias disponibles:\n${trendContext}\n\nNo inventes precio, stock, garantia ni especificaciones. Cada angulo debe ser grabable con manos, producto y un espacio comercial u hogareno simple. Devuelve JSON: {"angles":[{"format":"","hook":"","rationale":"","visualDirection":"","viabilityScore":1-5,"trendId":"opcional"}]}`;
  try {
    const response = await fetch(llm.endpoint, { method: "POST", headers: llmHeaders(llm, "Los 5 Apostoles - Ideas para grabar"), body: JSON.stringify({ model: llm.model, messages: [{ role: "system", content: "Devolves solamente JSON valido." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.8, max_tokens: 1400 }) });
    if (!response.ok) return fallback;
    const json = JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}");
    const angles = Array.isArray(json.angles) ? json.angles.slice(0, 3) : [];
    return angles.length === 3 ? angles.map((angle: any, index: number) => cleanAngle(angle, fallback[index])) : fallback;
  } catch {
    return fallback;
  }
}

export async function analyzeTrend(trendId: string) {
  const trend = await prisma.trend.findUnique({ where: { id: trendId } });
  if (!trend?.clientId) return null;
  const [client, products] = await Promise.all([prisma.client.findUnique({ where: { id: trend.clientId } }), prisma.product.findMany({ where: { brand: { clientId: trend.clientId } }, take: 30 })]);
  if (!client || !products.length) return prisma.trend.update({ where: { id: trendId }, data: { analysisStatus: "NEEDS_REVIEW" } });
  const llm = resolveLLMConfig(client);
  if (!llm.apiKey) return prisma.trend.update({ where: { id: trendId }, data: { analysisStatus: "NEEDS_REVIEW" } });
  const catalog = products.map((p) => `${p.id}: ${p.name} — ${p.category}`).join("\n");
  const prompt = `Analiza esta referencia para contenido corto: titulo=${trend.title}; descripcion=${trend.description}; plataforma=${trend.platform}. Catalogo:\n${catalog}\nDevuelve JSON {"isAudiovisual":true,"viabilityScore":1-5,"viralFormula":"una oracion","suggestedProductId":"id o vacio","suggestedAngle":"una oracion","visualDirection":"una oracion"}. Si es una busqueda abstracta o no tiene formato audiovisual, isAudiovisual es false.`;
  try {
    const response = await fetch(llm.endpoint, { method: "POST", headers: llmHeaders(llm, "Los 5 Apostoles - Analisis de radar"), body: JSON.stringify({ model: llm.model, messages: [{ role: "system", content: "Devolves solamente JSON valido." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 700 }) });
    if (!response.ok) throw new Error("LLM unavailable");
    const data = JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}");
    const productOk = products.some((p) => p.id === data.suggestedProductId);
    return prisma.trend.update({ where: { id: trendId }, data: { analysisStatus: data.isAudiovisual ? "ANALYZED" : "NEEDS_REVIEW", viabilityScore: clampScore(data.viabilityScore), viralFormula: String(data.viralFormula || "Referencia sin formula audiovisual clara."), suggestedProductId: productOk ? data.suggestedProductId : "", suggestedAngle: String(data.suggestedAngle || "Revisar manualmente antes de adaptar."), visualDirection: String(data.visualDirection || "") } });
  } catch {
    return prisma.trend.update({ where: { id: trendId }, data: { analysisStatus: "NEEDS_REVIEW" } });
  }
}

function fallbackAngles(product: Product, intent: ContentIntent, trends: Trend[]): EditorialAngle[] {
  const reference = trends[0];
  const base = product.name;
  const maps: Record<ContentIntent, EditorialAngle[]> = {
    SALE: [
      { format: "Problema / solucion", hook: `Si estas resolviendo esto a medias, mirá ${base}.`, rationale: "Hace visible una frustracion concreta antes de presentar el producto.", visualDirection: "Primer plano del problema, corte a manos usando el producto y resultado real.", viabilityScore: 5 },
      { format: "Demostracion rapida", hook: `Lo que cambia cuando sumás ${base} a tu setup.`, rationale: "Muestra valor sin promesas absolutas.", visualDirection: "Plano cenital, tres cortes de uso y texto breve en pantalla.", viabilityScore: 4 },
      { format: "Comparacion de flujo", hook: "Antes de elegir, mirá esta diferencia de uso.", rationale: "Ayuda a decidir con una demostracion tangible.", visualDirection: "Pantalla partida: flujo incomodo y flujo con el producto.", viabilityScore: 4 },
    ],
    EDUCATION: [
      { format: "3 errores comunes", hook: `3 errores antes de usar ${base}.`, rationale: "Curiosidad y utilidad inmediata.", visualDirection: "Creador a cámara, una toma practica por cada error.", viabilityScore: 5 },
      { format: "Mini guia", hook: `La forma simple de empezar con ${base}.`, rationale: "Baja la barrera para quien recién empieza.", visualDirection: "Plano de manos, pasos numerados y texto en pantalla.", viabilityScore: 5 },
      { format: "Mito / realidad", hook: "No, no necesitás complicarte para usarlo bien.", rationale: "Desactiva una objecion sin sobreprometer.", visualDirection: "Cartel mito, demostracion corta y cierre con resultado.", viabilityScore: 4 },
    ],
    USE_CASE: [
      { format: "POV", hook: `POV: necesitás resolver esto en tu espacio real.`, rationale: "Muestra el producto dentro de un contexto reconocible.", visualDirection: "Secuencia POV entrando al espacio, preparando y usando el producto.", viabilityScore: 5 },
      { format: "Un dia de uso", hook: `Así entra ${base} en una rutina real.`, rationale: "Convierte caracteristicas en una escena cotidiana.", visualDirection: "Tres momentos del día con transiciones rápidas.", viabilityScore: 4 },
      { format: "Setup pequeño", hook: "No hace falta un estudio gigante para resolver esto.", rationale: "Ataca una limitacion frecuente de espacio.", visualDirection: "Plano abierto del espacio y detalles de uso con manos.", viabilityScore: 5 },
    ],
    ENTERTAINMENT: [
      { format: "Expectativa / realidad", hook: "Expectativa: cinco pasos. Realidad: uno bien hecho.", rationale: "Humor breve basado en un problema real.", visualDirection: "Corte rapido entre exageracion y uso simple del producto.", viabilityScore: 4 },
      { format: "POV de comunidad", hook: "POV: por fin encontrás una forma práctica de hacerlo.", rationale: "Usa reconocimiento sin copiar una referencia.", visualDirection: "Actuacion breve, reacción y demostracion del producto.", viabilityScore: 4 },
      { format: "Reto de 15 segundos", hook: `¿Se puede hacer esto con ${base} en 15 segundos?`, rationale: "Genera tension y una prueba visual concreta.", visualDirection: "Cronometro en pantalla y toma continua de manos.", viabilityScore: 5 },
    ],
  };
  return maps[intent].map((angle) => ({ ...angle, trendId: reference?.id }));
}

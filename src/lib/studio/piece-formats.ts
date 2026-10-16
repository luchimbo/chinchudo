import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchChatCompletion, resolveLLMConfig } from "@/lib/llm-provider";
import { policyInstructions } from "@/lib/response-policy";
import { ARGENTINE_SPANISH_RULES, SCRIPT_SYSTEM_MESSAGE, voiceExamplesBlock } from "@/lib/script-voice";
import { findSelectedVideoPersona } from "@/lib/video-persona-selector";
import { classifyHook, humanizeText, toRioplatense } from "@/lib/reel-craft";
import { words } from "@/lib/reel-craft/text";

// ig-carousel / ig-story / ig-repurpose: a partir de una pieza (y su guion, si
// existe) arma otros formatos. Todo pasa por voseo y humanizador antes de guardarse.

export type CarouselSlide = { title: string; body: string };
export type Carousel = { cover: string; slides: CarouselSlide[]; lastSlide: string };
export type StoryFrame = { text: string; sticker: string; goal: string };
export type PieceExtras = { carousel?: Carousel; stories?: StoryFrame[] };

const clean = (text: unknown) => humanizeText(toRioplatense(String(text ?? "")).text).text.trim();

export function readExtras(value: unknown): PieceExtras {
  return value && typeof value === "object" ? (value as PieceExtras) : {};
}

async function pieceContext(pieceId: string) {
  const piece = await prisma.contentIdea.findUniqueOrThrow({
    where: { id: pieceId },
    include: { product: { include: { brand: true } }, client: true, videoScripts: { where: { status: { in: ["APPROVED", "NEW"] } }, orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  const script = piece.videoScripts[0];
  const personas = await prisma.persona.findMany({ where: { clientId: piece.clientId } });
  const persona = findSelectedVideoPersona(personas, piece.product);
  const examples = persona ? await voiceExamplesBlock(persona, { compact: true }) : "";
  const source = script ? `Guion aprobado:\nGancho: ${script.hook}\n${script.bodyText}\nCierre: ${script.cta}` : `Idea: ${piece.hook}\n${piece.rationale}`;
  const context = `${ARGENTINE_SPANISH_RULES}\n${examples ? `\n${examples}\n` : ""}\nCliente: ${piece.client.name} (${piece.client.description}). ${policyInstructions(piece.client).text}\nProducto: ${piece.product.name} (${piece.product.brand.name}). ${piece.product.description.slice(0, 600)}\n${source}\nNo inventes precio, stock, garantía ni datos técnicos: si falta un número, {{dato}}.`;
  return { piece, script, context };
}

async function askJson(clientId: string, prompt: string, title: string): Promise<any | null> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const llm = resolveLLMConfig(client);
  if (!llm.apiKey) return null;
  try {
    const { response } = await fetchChatCompletion(llm, { messages: [{ role: "system", content: SCRIPT_SYSTEM_MESSAGE }, { role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.7, max_tokens: 1600 }, title, client);
    if (!response.ok) return null;
    return JSON.parse((await response.json()).choices?.[0]?.message?.content || "{}");
  } catch (err) {
    console.error(`[${title}] Falló la IA, uso la versión base:`, err);
    return null;
  }
}

/** Portada de 8 palabras como máximo: se corta en una palabra entera. */
export function shortCover(text: string, max = 8): string {
  const list = words(text);
  return list.length <= max ? text.trim() : `${list.slice(0, max).join(" ")}…`;
}

export function asCarouselText(text: string): string {
  return text.replace(/\b(este|el|ese)\s+(reel|video)\b/gi, (_, article: string) => `${article} carrusel`).replace(/\b(reel|video)\b/gi, "carrusel");
}

/** Carrusel base desde el guion: una diapositiva por línea, sin IA. */
export function carouselFromScript(hook: string, body: string, cta: string): Carousel {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
  return {
    cover: shortCover(hook),
    slides: lines.map((line, index) => ({ title: `${index + 1}`, body: line })),
    lastSlide: cta || "Guardalo para tenerlo a mano.",
  };
}

export async function buildCarousel(pieceId: string): Promise<Carousel> {
  const { piece, script, context } = await pieceContext(pieceId);
  const json = await askJson(piece.clientId, `${context}\n\nConvertí esto en un carrusel de Instagram (1080x1350) de 5 a 8 diapositivas. Portada: 8 palabras como máximo, que prometa algo concreto. Una idea por diapositiva, título corto y texto de 1 a 3 líneas. Última diapositiva: un solo pedido (guardar, comentar o escribir). Devolvé JSON: {"cover":"","slides":[{"title":"","body":""}],"lastSlide":""}`, "Los 5 Apostoles - Carrusel");
  const base = carouselFromScript(script?.hook ?? piece.hook, script?.bodyText ?? piece.rationale, script?.cta ?? "");
  const carousel: Carousel = json && Array.isArray(json.slides) && json.slides.length >= 3
    ? { cover: shortCover(clean(json.cover) || base.cover), slides: json.slides.slice(0, 8).map((slide: any) => ({ title: clean(slide?.title).slice(0, 80), body: clean(slide?.body).slice(0, 400) })).filter((slide: CarouselSlide) => slide.body), lastSlide: clean(json.lastSlide) || base.lastSlide }
    : base;
  // El cierre viene del guion del reel: en un carrusel no se habla de "este reel".
  carousel.lastSlide = asCarouselText(carousel.lastSlide);
  await saveExtras(piece.id, piece.extras, { carousel });
  return carousel;
}

export function storiesFromScript(hook: string, cta: string): StoryFrame[] {
  return [
    { text: hook, sticker: "Encuesta: ¿Te pasa?", goal: "Abrir la conversación" },
    { text: "Te muestro cómo lo resolvemos.", sticker: "Ninguno", goal: "Mostrar el producto en uso" },
    { text: cta || "¿Querés que te contemos más?", sticker: "Pregunta: escribinos tu duda", goal: "Llevar al mensaje directo" },
  ];
}

export async function buildStories(pieceId: string): Promise<StoryFrame[]> {
  const { piece, script, context } = await pieceContext(pieceId);
  const json = await askJson(piece.clientId, `${context}\n\nArmá una secuencia de 3 a 5 historias de Instagram sobre este tema. Cada historia tiene un trabajo: abrir conversación, mostrar, probar, llevar al mensaje directo. Para cada una: texto en pantalla (corto), sticker (encuesta, pregunta, quiz, deslizador, link o ninguno, con su texto) y el objetivo. Devolvé JSON: {"stories":[{"text":"","sticker":"","goal":""}]}`, "Los 5 Apostoles - Historias");
  const stories: StoryFrame[] = json && Array.isArray(json.stories) && json.stories.length >= 3
    ? json.stories.slice(0, 5).map((story: any) => ({ text: clean(story?.text).slice(0, 300), sticker: clean(story?.sticker).slice(0, 160) || "Ninguno", goal: clean(story?.goal).slice(0, 160) })).filter((story: StoryFrame) => story.text)
    : storiesFromScript(script?.hook ?? piece.hook, script?.cta ?? "");
  await saveExtras(piece.id, piece.extras, { stories });
  return stories;
}

/** ig-repurpose: 2 piezas nuevas desde la misma idea, para revisar en el plan. */
export async function buildMorePieces(pieceId: string): Promise<number> {
  const { piece, context } = await pieceContext(pieceId);
  const json = await askJson(piece.clientId, `${context}\n\nSacá 2 piezas nuevas e independientes de este mismo contenido: otro ángulo, otro gancho, otro formato (reel, carrusel o historia). Cada una tiene que funcionar sola, sin haber visto la original. Devolvé JSON: {"pieces":[{"pieceType":"REEL|CAROUSEL|STORY","hook":"","rationale":"","format":""}]}`, "Los 5 Apostoles - Más piezas");
  const fallback = [
    { pieceType: "CAROUSEL", hook: `Lo que hay que saber de ${piece.product.name} antes de elegir`, rationale: "Versión para guardar del mismo tema.", format: "Carrusel educativo" },
    { pieceType: "STORY", hook: `¿Te pasa esto? Contanos y te ayudamos a elegir`, rationale: "Abre conversación por mensaje directo.", format: "Historia con pregunta" },
  ];
  const raw: any[] = json && Array.isArray(json.pieces) && json.pieces.length ? json.pieces.slice(0, 2) : fallback;
  const data = raw.map((item) => {
    const hook = clean(item?.hook).slice(0, 300);
    const pieceType = ["REEL", "CAROUSEL", "STORY"].includes(item?.pieceType) ? item.pieceType : "REEL";
    return { clientId: piece.clientId, productId: piece.productId, trendId: piece.trendId, intent: piece.intent, format: clean(item?.format).slice(0, 120) || "Derivada", hook, rationale: clean(item?.rationale).slice(0, 400) || `Sale de: ${piece.hook}`, visualDirection: "", status: "REVIEW" as const, pieceType, formulaId: classifyHook(hook)?.id ?? null };
  }).filter((item) => item.hook);
  if (data.length) await prisma.contentIdea.createMany({ data });
  return data.length;
}

async function saveExtras(id: string, current: Prisma.JsonValue, patch: PieceExtras) {
  await prisma.contentIdea.update({ where: { id }, data: { extras: { ...readExtras(current), ...patch } as unknown as Prisma.InputJsonValue } });
}

import type { PrismaClient } from "@prisma/client";

// Formas mínimas para no acoplar la lógica de matching al cliente Prisma (testeable).
export type KnowledgeLike = {
  topic: string;
  content: string;
  clientId?: string | null;
  brandId: string | null;
  productId: string | null;
  confidence?: string;
};

export type ObjectionLike = {
  objection: string;
  recommendedAnswer: string;
  clientId?: string | null;
  brandId: string | null;
  productId: string | null;
};

export type KnowledgeContext = {
  sourceText: string;
  clientId?: string | null;
  brandId?: string | null;
  productId?: string | null;
};

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Palabras vacías frecuentes (4+ letras) que generan matches falsos.
const STOPWORDS = new Set([
  "para", "pero", "como", "esta", "este", "esto", "esos", "esas", "esae", "unos", "unas",
  "donde", "cuando", "porque", "tambien", "desde", "hasta", "sobre", "entre", "cual", "cuales",
  "todo", "toda", "todos", "todas", "estan", "tengo", "tiene", "tienen", "hace", "hacer",
  "muy", "mas", "vale", "pena", "ser", "una", "uno", "los", "las", "del", "con", "por",
  "que", "qué", "hola", "buenas", "gracias",
]);

// Tokens significativos del comentario (descarta cortos y stopwords).
function tokens(text: string): string[] {
  return Array.from(
    new Set(
      normalize(text)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  );
}

// Una entrada aplica si su marca/producto coincide con el contexto o es global (null).
function scopeMatches(
  entryClientId: string | null | undefined,
  entryBrandId: string | null,
  entryProductId: string | null,
  ctx: KnowledgeContext,
): boolean {
  if (ctx.clientId && entryClientId && entryClientId !== ctx.clientId) return false;
  if (entryBrandId && ctx.brandId && entryBrandId !== ctx.brandId) return false;
  if (entryProductId && ctx.productId && entryProductId !== ctx.productId) return false;
  return true;
}

function overlapScore(haystack: string, needles: string[]): number {
  const h = normalize(haystack);
  let score = 0;
  for (const tok of needles) if (h.includes(tok)) score += 1;
  return score;
}

export function selectRelevantKnowledge<T extends KnowledgeLike>(
  ctx: KnowledgeContext,
  entries: T[],
  max = 3,
): T[] {
  const needles = tokens(ctx.sourceText);
  return entries
    .filter((e) => scopeMatches(e.clientId, e.brandId, e.productId, ctx))
    .map((e) => {
      const base = overlapScore(`${e.topic} ${e.content}`, needles);
      const productExact = !!(e.productId && ctx.productId && e.productId === ctx.productId);
      const brandMatch = !!(e.brandId && ctx.brandId && e.brandId === ctx.brandId);
      // Incluir solo si hay relevancia real (keywords) o es del producto exacto.
      // Marca/producto suman al ranking pero no incluyen por sí solos.
      const score = base + (productExact ? 5 : 0) + (brandMatch ? 0.5 : 0);
      return { e, score, keep: base > 0 || productExact };
    })
    .filter((x) => x.keep)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.e);
}

export function selectRelevantObjections<T extends ObjectionLike>(
  ctx: KnowledgeContext,
  objections: T[],
  max = 2,
): T[] {
  const needles = tokens(ctx.sourceText);
  return objections
    .filter((o) => scopeMatches(o.clientId, o.brandId, o.productId, ctx))
    .map((o) => {
      const base = overlapScore(`${o.objection} ${o.recommendedAnswer}`, needles);
      const productExact = !!(o.productId && ctx.productId && o.productId === ctx.productId);
      const brandMatch = !!(o.brandId && ctx.brandId && o.brandId === ctx.brandId);
      const score = base + (productExact ? 5 : 0) + (brandMatch ? 0.5 : 0);
      return { o, score, keep: base > 0 || productExact };
    })
    .filter((x) => x.keep)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.o);
}

// Helper de carga: trae KB + objeciones de la BD y devuelve solo las relevantes al contexto.
export async function loadRelevantKnowledge(
  prisma: PrismaClient,
  ctx: KnowledgeContext,
): Promise<{ knowledge: KnowledgeLike[]; objections: ObjectionLike[] }> {
  const [kb, obj] = await Promise.all([
    prisma.knowledgeBase.findMany({
      where: ctx.clientId ? { OR: [{ clientId: ctx.clientId }, { clientId: null }] } : undefined,
    }),
    prisma.objection.findMany({
      where: ctx.clientId ? { OR: [{ clientId: ctx.clientId }, { clientId: null }] } : undefined,
    }),
  ]);
  return {
    knowledge: selectRelevantKnowledge(ctx, kb),
    objections: selectRelevantObjections(ctx, obj),
  };
}

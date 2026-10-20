import type { Prisma, PrismaClient } from "@prisma/client";

/** Producto propio que puede protagonizar o quedar fuera de un artículo. */
export type BlogCatalogProduct = { id: string; name: string; brand: string; category: string };
/** Plan opcional de un día: protagonista, exclusiones y rival para comparar. */
export type BlogDayPlan = { productId?: string; excludedProductIds?: string[]; competitor?: string; competitorNotes?: string };

export const COMPETITOR_MAX = 60;
export const COMPETITOR_NOTES_MAX = 300;
export const MAX_DAY_EXCLUSIONS = 30;
export const excludedProductsKey = (clientId: string) => `blog_excluded_products:${clientId}`;

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max + 1) : "";

/** Lee el plan guardado en `BlogPublication.preparation`, ignorando valores inválidos. */
export function dayPlanFrom(preparation: unknown): BlogDayPlan {
  const value = preparation && typeof preparation === "object" && !Array.isArray(preparation) ? preparation as Record<string, unknown> : {};
  const excluded = Array.isArray(value.excludedProductIds) ? value.excludedProductIds.filter((id): id is string => typeof id === "string" && !!id) : [];
  return {
    ...(typeof value.productId === "string" && value.productId ? { productId: value.productId } : {}),
    ...(excluded.length ? { excludedProductIds: excluded } : {}),
    ...(typeof value.competitor === "string" && value.competitor ? { competitor: value.competitor } : {}),
    ...(typeof value.competitorNotes === "string" && value.competitorNotes ? { competitorNotes: value.competitorNotes } : {}),
  };
}

export function parseExcludedList(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && !!id))] : [];
  } catch { return []; }
}

type CatalogDb = Pick<PrismaClient, "landingProduct" | "appSetting"> | Prisma.TransactionClient;

/** Catálogo elegible para el blog (mismo criterio que el generador) y exclusiones globales. */
export async function loadBlogCatalog(db: CatalogDb, clientId: string): Promise<{ products: BlogCatalogProduct[]; excluded: string[] }> {
  const [rows, setting] = await Promise.all([
    db.landingProduct.findMany({ where: { clientId, linkStatus: { not: "missing" } }, select: { externalId: true, name: true, brand: true, categoryKey: true, sourceSnapshot: true }, orderBy: { name: "asc" } }),
    db.appSetting.findUnique({ where: { key: excludedProductsKey(clientId) }, select: { value: true } }),
  ]);
  const products = rows
    .filter(row => !(row.sourceSnapshot && typeof row.sourceSnapshot === "object" && !Array.isArray(row.sourceSnapshot) && (row.sourceSnapshot as Record<string, unknown>).editorialEligible === false))
    .map(row => ({ id: row.externalId, name: row.name, brand: row.brand, category: row.categoryKey }));
  return { products, excluded: parseExcludedList(setting?.value) };
}

export type DayPlanInput = { productId?: unknown; excludedProductIds?: unknown; competitor?: unknown; competitorNotes?: unknown };

/** Valida el plan de un día contra el catálogo. Devuelve el plan normalizado o un error para el operador. */
export function validateDayPlan(input: DayPlanInput, context: { products: BlogCatalogProduct[]; excluded: string[]; ownBrands: string[]; decisionDay: boolean }): { plan: BlogDayPlan } | { error: string } {
  const known = new Map(context.products.map(product => [product.id, product]));
  const productId = clean(input.productId, 200);
  const rawExcluded = Array.isArray(input.excludedProductIds) ? input.excludedProductIds : [];
  const excludedProductIds = [...new Set(rawExcluded.map(id => clean(id, 200)).filter(Boolean))];
  const competitor = clean(input.competitor, COMPETITOR_MAX);
  const competitorNotes = clean(input.competitorNotes, COMPETITOR_NOTES_MAX);
  if (productId && !known.has(productId)) return { error: "El producto elegido ya no está en el catálogo. Elegí otro." };
  if (productId && context.excluded.includes(productId)) return { error: `${known.get(productId)!.name} está en la lista de productos que no se nombran.` };
  if (productId && excludedProductIds.includes(productId)) return { error: "El producto protagonista no puede estar también excluido." };
  if (excludedProductIds.length > MAX_DAY_EXCLUSIONS) return { error: `Podés excluir hasta ${MAX_DAY_EXCLUSIONS} productos por día.` };
  if (excludedProductIds.some(id => !known.has(id))) return { error: "Uno de los productos excluidos ya no está en el catálogo." };
  if (competitor.length > COMPETITOR_MAX) return { error: `El rival admite hasta ${COMPETITOR_MAX} caracteres.` };
  if (competitorNotes.length > COMPETITOR_NOTES_MAX) return { error: `Las notas del rival admiten hasta ${COMPETITOR_NOTES_MAX} caracteres.` };
  if (competitorNotes && !competitor) return { error: "Indicá el producto rival para usar las notas." };
  if (competitor && !context.decisionDay) return { error: "Las comparativas se programan en días «para elegir»." };
  const lowered = competitor.toLowerCase();
  if (competitor && context.ownBrands.some(brand => brand && lowered.includes(brand.toLowerCase()))) return { error: "El rival tiene que ser de otra marca." };
  return { plan: {
    ...(productId ? { productId } : {}),
    ...(excludedProductIds.length ? { excludedProductIds } : {}),
    ...(competitor ? { competitor } : {}),
    ...(competitor && competitorNotes ? { competitorNotes } : {}),
  } };
}

export const hasDayPlan = (input: DayPlanInput) => [input.productId, input.competitor, input.competitorNotes].some(value => typeof value === "string" && value.trim()) || (Array.isArray(input.excludedProductIds) && input.excludedProductIds.length > 0);

/** Marcas propias: el cliente y las marcas de su catálogo. */
export function ownBrandsFor(clientName: string | undefined, products: BlogCatalogProduct[]) {
  return [...new Set([clientName || "", ...products.map(product => product.brand)].map(value => value.trim()).filter(value => value.length >= 3))];
}

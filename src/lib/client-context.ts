import type {
  Brand,
  CatalogRule,
  Client,
  MonitoredSource,
  Opportunity,
  PrismaClient,
  Product,
} from "@prisma/client";
import { mentionsBrand } from "./brand-identity";

type OpportunityLike = Pick<Opportunity, "sourceText" | "detectedBrandId" | "monitoredSourceId"> & {
  detectedBrand?: (Brand & { client?: Client | null }) | null;
  monitoredSource?: (MonitoredSource & { client?: Client | null }) | null;
};

export type ClientResolution = {
  client: Client;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(str: string): string {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function keywordScore(text: string, keywords: string[], exclusions: string[]) {
  const haystack = normalizeForMatch(text);
  
  const exclusionHits = exclusions.filter((kw) => {
    const normalizedKw = normalizeForMatch(kw);
    const regex = new RegExp('\\b' + escapeRegex(normalizedKw) + '\\b', 'i');
    return regex.test(haystack);
  });
  if (exclusionHits.length > 0) return { score: -1000, hits: [], exclusionHits };

  const hits = keywords.filter((kw) => {
    const normalizedKw = normalizeForMatch(kw);
    const regex = new RegExp('\\b' + escapeRegex(normalizedKw) + '\\b', 'i');
    return regex.test(haystack);
  });
  return { score: hits.length, hits, exclusionHits };
}

export async function resolveOpportunityClient(
  prisma: PrismaClient,
  opportunity: OpportunityLike,
): Promise<ClientResolution> {
  const sourceClient = opportunity.monitoredSource?.client ??
    (opportunity.monitoredSourceId
      ? (await prisma.monitoredSource.findUnique({
          where: { id: opportunity.monitoredSourceId },
          include: { client: true },
        }))?.client
      : null);
  if (sourceClient) {
    return { client: sourceClient, confidence: "high", reason: "monitoredSource.clientId" };
  }

  const brandClient = opportunity.detectedBrand?.client ??
    (opportunity.detectedBrandId
      ? (await prisma.brand.findUnique({
          where: { id: opportunity.detectedBrandId },
          include: { client: true },
        }))?.client
      : null);
  if (brandClient) {
    return { client: brandClient, confidence: "high", reason: "detectedBrand.clientId" };
  }

  const clients = await prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  if (clients.length === 0) throw new Error("No hay clientes activos configurados.");

  const ranked = clients
    .map((client) => {
      const result = keywordScore(
        opportunity.sourceText,
        parseList(client.domainKeywords),
        parseList(client.domainExclusions),
      );
      return { client, ...result };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  const confidence: ClientResolution["confidence"] =
    best.score <= 0 ? "low" : runnerUp && runnerUp.score === best.score ? "low" : best.score === 1 ? "medium" : "high";
  const reason = best.hits.length > 0
    ? `best_keyword_match:${best.hits.join(",")}`
    : "fallback_first_active_client";

  return { client: best.client, confidence, reason };
}

export async function loadClientContext(
  prisma: PrismaClient,
  clientId: string,
  opportunity: Pick<Opportunity, "sourceText" | "detectedBrandId" | "detectedProductId"> & { sourceTitle?: string },
) {
  const [client, personas, catalogRules, detectedBrand, detectedProduct] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.persona.findMany({ where: { clientId }, include: { rules: true }, orderBy: { name: "asc" } }),
    prisma.catalogRule.findMany({ where: { clientId }, orderBy: { category: "asc" } }),
    opportunity.detectedBrandId ? prisma.brand.findUnique({ where: { id: opportunity.detectedBrandId } }) : null,
    opportunity.detectedProductId ? prisma.product.findUnique({ where: { id: opportunity.detectedProductId } }) : null,
  ]);

  const catalogProducts = await prisma.product.findMany({
    where: { brand: { clientId } },
    include: { brand: true },
    orderBy: { name: "asc" },
  });
  const sourceText = `${opportunity.sourceTitle ?? ""} ${opportunity.sourceText}`;
  const productBrand = catalogProducts.find((product) => product.id === detectedProduct?.id)?.brand;
  const explicitBrands = [...new Map(catalogProducts.filter((product) => mentionsBrand(sourceText, product.brand.name))
    .map((product) => [product.brand.id, product.brand])).values()];
  // Una oportunidad sin marca detectada no debe caer en la primera marca
  // alfabética (antes PC MIDI terminaba sistemáticamente en Alctron).
  const fallbackBrand = client.slug === "pcmidi"
    ? await prisma.brand.findFirst({ where: { clientId, name: { equals: "MidiPlus", mode: "insensitive" } } })
    : null;
  const detectedBrandIsExplicit = !!detectedBrand && mentionsBrand(sourceText, detectedBrand.name);
  // El fabricante del producto y la evidencia textual mandan sobre el respaldo operativo.
  const brand = productBrand ?? (explicitBrands.length === 1 ? explicitBrands[0] : null)
    ?? (detectedBrand?.clientId === clientId && detectedBrandIsExplicit ? detectedBrand : null)
    ?? fallbackBrand ?? await prisma.brand.findFirst({ where: { clientId }, orderBy: { name: "asc" } });
  if (!brand) throw new Error(`No hay marca configurada para clientId=${clientId}.`);

  const services = await prisma.service.findMany({
    where: { brand: { clientId } },
    include: { brand: true },
    orderBy: { name: "asc" },
  });

  return {
    client,
    brand,
    // El respaldo operativo no es una detección del fabricante de la consulta.
    detectedBrandId: productBrand?.id ?? (explicitBrands.length === 1 ? explicitBrands[0].id : null)
      ?? (detectedBrand?.clientId === clientId && detectedBrandIsExplicit ? detectedBrand.id : null),
    personas,
    catalogRules,
    catalogProducts,
    services,
    detectedProduct: detectedProduct?.brandId === brand.id ? detectedProduct : null,
  };
}

export function catalogRuleMatches(sourceText: string, rules: Pick<CatalogRule, "category" | "keywords">[]): string[] {
  const text = normalizeForMatch(sourceText);
  return rules
    .filter((rule) => parseList(rule.keywords).some((kw) => text.includes(normalizeForMatch(kw))))
    .map((rule) => rule.category);
}

export function parseClientList(value: string | null | undefined): string[] {
  return parseList(value);
}

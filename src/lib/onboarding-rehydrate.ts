import type { Client, PrismaClient } from "@prisma/client";
import {
  matchConfirmedBrand,
  parseDomainKeywords,
  sanitizeDraft,
  type OnboardingDraft,
  type OnboardingOffering,
} from "./onboarding";

/** Claves del draft que el dominio no sabe representar: siempre vienen del borrador. */
export const DRAFT_ONLY_KEYS = [
  "stats",
  "warnings",
  "evidence",
  "detectedPlatform",
  "detectedBusinessType",
  "manualFields",
  "unsureConfirmed",
  "knowledgeApproved",
] as const;

export type ConfirmedBrand = {
  id: string;
  name: string;
  tone: string;
  strengths: string;
  allowedClaims: string;
  forbiddenClaims: string;
};

export type ConfirmedSnapshot = {
  clientId: string;
  name: string;
  description: string;
  topics: string[];
  policy: Record<string, unknown>;
  brand: ConfirmedBrand | null;
  brandCount: number;
  brandAmbiguous: boolean;
  offerings: OnboardingOffering[];
  knowledge: { topic: string; content: string }[];
  networks: string[];
};

type ConfirmedProductRow = {
  brandId: string;
  name: string;
  category: string;
  description: string;
  technicalSpecs: string;
  useCases: string;
  stockStatus: string;
  priceRange: string;
  sourceExternalId: string | null;
  sourceUrl: string;
};

type ConfirmedServiceRow = {
  brandId: string;
  name: string;
  category: string;
  description: string;
  scope: string;
  modality: string;
  audience: string;
  priceRange: string;
  availabilityNotes: string;
  sourceExternalId: string | null;
  sourceUrl: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function productToOffering(row: ConfirmedProductRow): OnboardingOffering {
  const url = row.sourceUrl || "";
  return {
    id: row.sourceExternalId || `product-${row.name}`,
    kind: "product",
    name: row.name,
    category: row.category || "",
    description: row.description || "",
    specs: row.technicalSpecs || "",
    scope: row.useCases || "",
    modality: "",
    audience: "",
    price: row.priceRange || "Por confirmar",
    availability: row.stockStatus || "Por confirmar",
    url,
    selected: true,
    evidence: { url, status: "extracted", confidence: "high" },
  };
}

function serviceToOffering(row: ConfirmedServiceRow): OnboardingOffering {
  const url = row.sourceUrl || "";
  return {
    id: row.sourceExternalId || `service-${row.name}`,
    kind: "service",
    name: row.name,
    category: row.category || "",
    description: row.description || "",
    specs: "",
    scope: row.scope || "",
    modality: row.modality || "",
    audience: row.audience || "",
    price: row.priceRange || "Por confirmar",
    availability: row.availabilityNotes || "Por confirmar",
    url,
    selected: true,
    evidence: { url, status: "extracted", confidence: "high" },
  };
}

/**
 * Resuelve a qué marca confirmada corresponde el draft, en cascada: la primera
 * regla que acierta gana. Evita crear marcas duplicadas cuando el usuario
 * renombró la marca en /brands después de completar el onboarding.
 */
export function resolveConfirmedBrand(
  draft: Pick<Required<OnboardingDraft>, "brand" | "offerings" | "confirmedBrandId">,
  brands: ConfirmedBrand[],
  products: Pick<ConfirmedProductRow, "brandId" | "sourceExternalId">[],
  services: Pick<ConfirmedServiceRow, "brandId" | "sourceExternalId">[],
): ConfirmedBrand | null {
  if (!brands.length) return null;
  const byId = new Map(brands.map((brand) => [brand.id, brand]));

  if (draft.confirmedBrandId && byId.has(draft.confirmedBrandId)) {
    return byId.get(draft.confirmedBrandId)!;
  }

  const exact = brands.find((brand) => brand.name === draft.brand);
  if (exact) return exact;

  const offeringIds = new Set(draft.offerings.map((item) => item.id));
  const byProvenance =
    products.find((row) => row.sourceExternalId && offeringIds.has(row.sourceExternalId)) ||
    services.find((row) => row.sourceExternalId && offeringIds.has(row.sourceExternalId));
  if (byProvenance && byId.has(byProvenance.brandId)) {
    return byId.get(byProvenance.brandId)!;
  }

  const fuzzyName = matchConfirmedBrand(draft.brand, brands.map((brand) => brand.name));
  if (fuzzyName) {
    const found = brands.find((brand) => brand.name === fuzzyName);
    if (found) return found;
  }

  if (brands.length === 1) return brands[0];

  return null;
}

/** Lee, sin escribir nada, la configuración ya confirmada del cliente. */
export async function readConfirmedSnapshot(
  prisma: PrismaClient,
  client: Pick<Client, "id" | "name" | "description" | "domainKeywords" | "responsePolicy">,
  draft: Required<OnboardingDraft>,
): Promise<ConfirmedSnapshot> {
  const clientId = client.id;
  const db = prisma as any;
  const [brands, products, services, knowledgeRows, monitoredSources] = await Promise.all([
    db.brand.findMany({
      where: { clientId },
      select: { id: true, name: true, tone: true, strengths: true, allowedClaims: true, forbiddenClaims: true },
      orderBy: { createdAt: "asc" },
    }) as Promise<ConfirmedBrand[]>,
    db.product.findMany({
      where: { brand: { clientId }, sourceType: "website" },
      select: {
        brandId: true, name: true, category: true, description: true,
        technicalSpecs: true, useCases: true, stockStatus: true, priceRange: true,
        sourceExternalId: true, sourceUrl: true,
      },
    }) as Promise<ConfirmedProductRow[]>,
    db.service.findMany({
      where: { brand: { clientId }, sourceType: "website" },
      select: {
        brandId: true, name: true, category: true, description: true,
        scope: true, modality: true, audience: true, priceRange: true,
        availabilityNotes: true, sourceExternalId: true, sourceUrl: true,
      },
    }) as Promise<ConfirmedServiceRow[]>,
    db.knowledgeBase.findMany({
      where: { clientId, source: "onboarding" },
      select: { topic: true, content: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }) as Promise<{ topic: string; content: string }[]>,
    db.monitoredSource.findMany({
      where: { clientId, label: { startsWith: `${clientId}:onboarding:` }, active: true },
      select: { channel: true },
    }) as Promise<{ channel: string }[]>,
  ]);

  const brand = resolveConfirmedBrand(draft, brands, products, services);
  const offerings: OnboardingOffering[] = brand
    ? [
        ...products.filter((row) => row.brandId === brand.id).map(productToOffering),
        ...services.filter((row) => row.brandId === brand.id).map(serviceToOffering),
      ]
    : [];

  return {
    clientId,
    name: client.name,
    description: client.description,
    topics: parseDomainKeywords(client.domainKeywords),
    policy: isPlainObject(client.responsePolicy) ? client.responsePolicy : {},
    brand,
    brandCount: brands.length,
    brandAmbiguous: brands.length > 1 && !brand,
    offerings,
    knowledge: knowledgeRows,
    networks: monitoredSources.map((row) => row.channel),
  };
}

function pickConfirmed<T>(confirmed: T | undefined, fallback: T): T {
  return confirmed === undefined ? fallback : confirmed;
}

/**
 * El dominio manda; el borrador sólo aporta lo que el dominio no sabe
 * representar. Toda clave tomada del dominio se agrega a `manualFields` para
 * que un re-análisis posterior (mergeManualFields) nunca la pise: es lo que
 * hace seguro el botón "Volver a leer mi sitio" en modo edición.
 */
export function rehydrateDraftFromConfirmed(
  draft: Required<OnboardingDraft>,
  snapshot: ConfirmedSnapshot,
): Required<OnboardingDraft> {
  const policy = snapshot.policy as Partial<{
    tone: string;
    claims: string[];
    limits: string[];
    targetAudience: string;
    businessGoals: string[];
  }>;
  const manualFields = new Set(draft.manualFields);
  const take = (key: string) => manualFields.add(key);

  // El dominio siempre posee estos campos: gana aunque esté vacío.
  const name = snapshot.name;
  const description = snapshot.description;
  const topics = snapshot.topics;
  take("name");
  take("description");
  take("topics");

  let brand = draft.brand,
    tone = draft.tone,
    offer = draft.offer,
    claims = draft.claims,
    limits = draft.limits;

  if (snapshot.brand) {
    brand = snapshot.brand.name;
    tone = snapshot.brand.tone || pickConfirmed(policy.tone, draft.tone);
    offer = snapshot.brand.strengths;
    claims = splitLines(snapshot.brand.allowedClaims);
    limits = splitLines(snapshot.brand.forbiddenClaims);
    take("brand");
    take("tone");
    take("offer");
    take("claims");
    take("limits");
  } else {
    // Sin marca resuelta (ninguna todavía, o ambigua): lo único que puede
    // rescatarse es lo que haya en responsePolicy.
    if (policy.tone !== undefined) {
      tone = policy.tone;
      take("tone");
    }
    if (Array.isArray(policy.claims)) {
      claims = policy.claims;
      take("claims");
    }
    if (Array.isArray(policy.limits)) {
      limits = policy.limits;
      take("limits");
    }
  }

  const targetAudience = pickConfirmed(policy.targetAudience, draft.targetAudience);
  if (policy.targetAudience !== undefined) take("targetAudience");
  const businessGoals = pickConfirmed(policy.businessGoals, draft.businessGoals);
  if (Array.isArray(policy.businessGoals)) take("businessGoals");

  // Conocimiento: filas confirmadas por orden, completando con el draft si faltan.
  const knowledge = [...draft.knowledge];
  const knowledgePrompts = [...draft.knowledgePrompts];
  snapshot.knowledge.slice(0, 3).forEach((row, index) => {
    knowledge[index] = row.content;
    knowledgePrompts[index] = row.topic;
    take(`knowledge-${index}`);
  });

  // Catálogo: lo confirmado manda. Del draft sólo se conservan las ofertas sin
  // fila de dominio todavía porque están pendientes de sincronizar o fueron
  // cargadas a mano y no se activaron — cualquier otra oferta sin fila fue
  // borrada a propósito en /products y no debe resucitar.
  const confirmedIds = new Set(snapshot.offerings.map((item) => item.id));
  const keepFromDraft = draft.offerings.filter(
    (item) =>
      !confirmedIds.has(item.id) &&
      (item.evidence?.status === "manual" || draft.stats.catalogSyncPending === true),
  );
  const offerings = snapshot.brand ? [...snapshot.offerings, ...keepFromDraft] : draft.offerings;

  const selectedNetworks = snapshot.networks.length ? snapshot.networks : draft.selectedNetworks;
  if (snapshot.networks.length) take("selectedNetworks");

  const confirmedBrandId = snapshot.brand ? snapshot.brand.id : draft.confirmedBrandId;

  const merged: Required<OnboardingDraft> = {
    ...draft,
    name,
    description,
    topics,
    brand,
    tone,
    offer,
    claims,
    limits,
    targetAudience,
    businessGoals,
    knowledge,
    knowledgePrompts,
    offerings,
    selectedNetworks,
    confirmedBrandId,
    manualFields: [...manualFields],
  };
  return sanitizeDraft(merged, snapshot.name);
}

/** Atajo para page.tsx y GET /api/onboarding: rehidrata sólo si ya está COMPLETED. */
export async function confirmedDraftFor(
  prisma: PrismaClient,
  client: Pick<Client, "id" | "name" | "description" | "domainKeywords" | "responsePolicy">,
  onboarding: { status: string; draft: unknown } | null,
): Promise<Required<OnboardingDraft>> {
  const draft = sanitizeDraft(onboarding?.draft, client.name);
  if (!onboarding || onboarding.status !== "COMPLETED") return draft;
  const snapshot = await readConfirmedSnapshot(prisma, client, draft);
  return rehydrateDraftFromConfirmed(draft, snapshot);
}

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import type { PrismaClient } from "@prisma/client";
import { fetchChatCompletion, resolveLLMConfig, type LegacyClientLLMConfig, type LLMConfig } from "./llm-provider";
import { normalizeWebsiteUrl } from "./website-url";
import { logger } from "./logger";

export { normalizeWebsiteUrl } from "./website-url";

export type EvidenceStatus =
  | "extracted"
  | "suggested"
  | "manual"
  | "needs_confirmation";
export type OfferingKind = "product" | "service";
export type OnboardingEvidence = {
  url: string;
  label?: string;
  status: EvidenceStatus;
  confidence: "high" | "medium" | "low";
};
export type OnboardingOffering = {
  id: string;
  kind: OfferingKind;
  name: string;
  category: string;
  description: string;
  specs: string;
  scope: string;
  modality: string;
  audience: string;
  price: string;
  availability: string;
  url: string;
  selected: boolean;
  evidence: OnboardingEvidence;
};
export type OnboardingDraft = {
  name?: string;
  description?: string;
  brand?: string;
  /** Id de la Brand confirmada a la que corresponde este draft, cuando se resolvió sin ambigüedad. */
  confirmedBrandId?: string;
  tone?: string;
  offer?: string;
  targetAudience?: string;
  businessGoals?: string[];
  topics?: string[];
  claims?: string[];
  limits?: string[];
  knowledge?: string[];
  knowledgePrompts?: string[];
  knowledgeApproved?: boolean;
  selectedNetworks?: string[];
  unsureConfirmed?: boolean;
  detectedBusinessType?: "products" | "services" | "mixed";
  detectedPlatform?: string;
  offerings?: OnboardingOffering[];
  evidence?: Record<string, OnboardingEvidence>;
  manualFields?: string[];
  warnings?: string[];
  stats?: {
    pagesRead: number;
    pagesDiscarded: number;
    products: number;
    services: number;
    importedProducts?: number;
    importedServices?: number;
    catalogSyncPending?: boolean;
    catalogNextOffset?: number;
    durationMs: number;
  };
};
export type WebsitePage = {
  url: string;
  title: string;
  description: string;
  text: string;
  pageType: string;
  offerings: OnboardingOffering[];
  socialNetworks: string[];
  platform: string;
  hash: string;
};
export type WebsiteAnalysis = {
  draft: Required<OnboardingDraft>;
  pages: WebsitePage[];
  warning?: string;
};
export type WebsiteAnalysisOptions = {
  candidateOffset?: number;
  skipSuggestions?: boolean;
};
/** Configuración ya confirmada del cliente: tiene prioridad sobre lo que la web propone. */
export type ConfirmedClientContext = LegacyClientLLMConfig & {
  name: string;
  brands: string[];
  description: string;
  domainKeywords: string[];
};
export type BusinessSignals = {
  candidateBrand: string;
  categories: { name: string; count: number }[];
  repeatedUses: string[];
  dominantTerms: string[];
  representativeProducts: string[];
};

/** Convierte `Client.domainKeywords` (JSON almacenado como string) en un arreglo seguro. */
export function parseDomainKeywords(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

const voices = ["Técnico", "Práctico", "Innovación", "Educativo", "Comercial"];
const MAX_PAGES = 40,
  MAX_PROMPT_PAGES = 8,
  MAX_DISCOVERED_CANDIDATES = 1_000,
  MAX_BYTES = 2_000_000,
  TOTAL_TIMEOUT = 25_000,
  PAGE_TIMEOUT = 7_000;
const BLOCKED_PATH =
  /\/(?:login|account|mi-cuenta|cart|carrito|checkout|pedido|orders?|admin)(?:\/|$)/i;
const SOCIAL_HOSTS: Record<string, string> = {
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "tiktok.com": "TikTok",
  "x.com": "X",
  "twitter.com": "X",
  "linkedin.com": "LinkedIn",
};

export function defaultDraft(clientName = ""): Required<OnboardingDraft> {
  return {
    name: clientName,
    description: "",
    brand: clientName,
    confirmedBrandId: "",
    tone: "Claro y cercano",
    offer: "",
    targetAudience: "",
    businessGoals: [],
    topics: [],
    claims: [],
    limits: [],
    knowledge: ["", "", ""],
    knowledgePrompts: [
      "Problema que resolvemos",
      "Cómo elegir una opción",
      "Pregunta frecuente",
    ],
    knowledgeApproved: false,
    selectedNetworks: [],
    unsureConfirmed: false,
    detectedBusinessType: "mixed",
    detectedPlatform: "Sitio web",
    offerings: [],
    evidence: {},
    manualFields: [],
    warnings: [],
    stats: {
      pagesRead: 0,
      pagesDiscarded: 0,
      products: 0,
      services: 0,
      importedProducts: 0,
      importedServices: 0,
      catalogSyncPending: false,
      catalogNextOffset: 0,
      durationMs: 0,
    },
  };
}
const clipped = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const strings = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];
function evidence(value: unknown): OnboardingEvidence | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<OnboardingEvidence>;
  if (
    !raw.url ||
    !["extracted", "suggested", "manual", "needs_confirmation"].includes(
      raw.status || "",
    )
  )
    return undefined;
  return {
    url: clipped(raw.url, 2000),
    label: clipped(raw.label, 160) || undefined,
    status: raw.status as EvidenceStatus,
    confidence: ["high", "medium", "low"].includes(raw.confidence || "")
      ? (raw.confidence as OnboardingEvidence["confidence"])
      : "low",
  };
}
function offering(value: unknown, index: number): OnboardingOffering | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<OnboardingOffering>;
  const kind =
      raw.kind === "product" || raw.kind === "service" ? raw.kind : null,
    name = clipped(raw.name, 180);
  if (!kind || !name) return null;
  return {
    id: clipped(raw.id, 180) || `${kind}-${index}`,
    kind,
    name,
    category: clipped(raw.category, 160),
    description: clipped(raw.description, 3000),
    specs: clipped(raw.specs, 3000),
    scope: clipped(raw.scope, 1500),
    modality: clipped(raw.modality, 500),
    audience: clipped(raw.audience, 500),
    price: clipped(raw.price, 240) || "Por confirmar",
    availability: clipped(raw.availability, 240) || "Por confirmar",
    url: clipped(raw.url, 2000),
    selected: raw.selected !== false,
    evidence: evidence(raw.evidence) || {
      url: clipped(raw.url, 2000),
      status: "needs_confirmation",
      confidence: "low",
    },
  };
}
export function sanitizeDraft(
  value: unknown,
  clientName = "",
): Required<OnboardingDraft> {
  const raw =
      value && typeof value === "object" ? (value as OnboardingDraft) : {},
    base = defaultDraft(clientName),
    stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {},
    rawEvidence =
      raw.evidence && typeof raw.evidence === "object" ? raw.evidence : {};
  const offerings = Array.isArray(raw.offerings)
    ? raw.offerings
        .map(offering)
        .filter((item): item is OnboardingOffering => Boolean(item))
        .slice(0, 100)
    : [];
  const mappedEvidence = Object.fromEntries(
    Object.entries(rawEvidence)
      .map(([key, item]) => [key, evidence(item)])
      .filter(([, item]) => Boolean(item)),
  ) as Record<string, OnboardingEvidence>;
  return {
    ...base,
    ...raw,
    name: clipped(raw.name, 160) || base.name,
    description: clipped(raw.description, 2000),
    brand: clipped(raw.brand, 160) || base.brand,
    confirmedBrandId: clipped(raw.confirmedBrandId, 60),
    tone: clipped(raw.tone, 160) || base.tone,
    offer: clipped(raw.offer, 800),
    targetAudience: clipped(raw.targetAudience, 800),
    businessGoals: strings(raw.businessGoals, 3).map((item) =>
      clipped(item, 240),
    ),
    // Topes generosos: Client.domainKeywords y Brand.allowedClaims/forbiddenClaims
    // no tienen límite en la base. Un tope bajo trunca en silencio un round-trip
    // con la configuración confirmada (ver rehydrateDraftFromConfirmed).
    topics: strings(raw.topics, 40),
    claims: strings(raw.claims, 30),
    limits: strings(raw.limits, 30),
    knowledge: strings(raw.knowledge, 3).concat(["", "", ""]).slice(0, 3),
    knowledgePrompts: strings(raw.knowledgePrompts, 3)
      .concat(base.knowledgePrompts)
      .slice(0, 3),
    selectedNetworks: strings(raw.selectedNetworks, 8),
    knowledgeApproved: raw.knowledgeApproved === true,
    unsureConfirmed: raw.unsureConfirmed === true,
    detectedBusinessType:
      raw.detectedBusinessType === "products" ||
      raw.detectedBusinessType === "services"
        ? raw.detectedBusinessType
        : "mixed",
    detectedPlatform:
      clipped(raw.detectedPlatform, 80) || base.detectedPlatform,
    offerings,
    evidence: mappedEvidence,
    manualFields: strings(raw.manualFields, 80),
    warnings: strings(raw.warnings, 20),
    stats: {
      pagesRead: Number((stats as any).pagesRead) || 0,
      pagesDiscarded: Number((stats as any).pagesDiscarded) || 0,
      products: Number((stats as any).products) || 0,
      services: Number((stats as any).services) || 0,
      importedProducts: Number((stats as any).importedProducts) || 0,
      importedServices: Number((stats as any).importedServices) || 0,
      catalogSyncPending: (stats as any).catalogSyncPending === true,
      catalogNextOffset: Number((stats as any).catalogNextOffset) || 0,
      durationMs: Number((stats as any).durationMs) || 0,
    },
  };
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}
export async function assertPublicUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Ingresá una dirección web válida.");
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.endsWith(".local") ||
    url.hostname === "localhost"
  )
    throw new Error("La URL no es pública o no es compatible.");
  if (isIP(url.hostname) && privateAddress(url.hostname))
    throw new Error("No se permiten direcciones internas.");
  const addresses = await lookup(url.hostname, {
    all: true,
    verbatim: true,
  }).catch(() => {
    throw new Error("No pudimos resolver el dominio.");
  });
  if (
    !addresses.length ||
    addresses.some(({ address }) => privateAddress(address))
  )
    throw new Error("El dominio apunta a una red interna y fue bloqueado.");
  return url;
}

async function safeFetch(
  input: URL,
  startedAt: number,
  redirects = 0,
): Promise<{ url: URL; html: string }> {
  if (Date.now() - startedAt > TOTAL_TIMEOUT)
    throw new Error("El análisis superó el tiempo máximo.");
  const url = await assertPublicUrl(input.toString());
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(PAGE_TIMEOUT),
    headers: {
      "User-Agent": "Cafishia-OnboardingBot/1.0",
      Accept:
        "text/html,text/plain,application/xhtml+xml,application/xml,text/xml;q=0.9",
    },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 4) throw new Error("Demasiadas redirecciones.");
    const target = response.headers.get("location");
    if (!target) throw new Error("Redirección inválida.");
    return safeFetch(new URL(target, url), startedAt, redirects + 1);
  }
  if (!response.ok) throw new Error(`El sitio respondió ${response.status}.`);
  if (
    !/text\/(html|xml|plain)|application\/(xhtml\+xml|xml)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new Error("La URL no contiene una página HTML.");
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES)
    throw new Error("La página es demasiado grande.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("La página es demasiado grande.");
  return { url, html: new TextDecoder().decode(bytes) };
}
function robotsAllows(robots: string, path: string): boolean {
  const lines = robots.split(/\r?\n/);
  let applies = false;
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key.trim().toLowerCase() === "user-agent") applies = value === "*";
    if (
      applies &&
      key.trim().toLowerCase() === "disallow" &&
      value &&
      path.startsWith(value)
    )
      return false;
  }
  return true;
}
function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 16_000);
}
const SUMMARY_STOP_MARKERS =
  /\b(?:al navegar|uso de cookies?|cookies?|iniciar sesi[oó]n|crear cuenta|agregado al carrito|ver carrito|total\s*\(|descuento|env[ií]o gratis|sin inter[eé]s)\b/i;

/** Removes storefront chrome from metadata before it can become the business summary. */
export function cleanBusinessSummary(value: string) {
  const summary = cleanText(value);
  const marker = summary.search(SUMMARY_STOP_MARKERS);
  return (marker >= 0 ? summary.slice(0, marker) : summary).trim().slice(0, 500);
}

function fallbackOffer(offerings: OnboardingOffering[]) {
  const labels = [...new Set(offerings.flatMap((item) => [item.category, item.name]).filter(Boolean))]
    .slice(0, 3);
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} y ${labels[2]}`;
}
const GENERIC_OFFER_NAME =
  /^(?:compr[áa]\s+(?:online\s+)?(?:productos?|servicios?)(?:\s+en\s+.+)?|(?:tienda|shop|cat[aá]logo)(?:\s+online)?|productos?|servicios?)$/i;

export function isGenericOfferingName(value: string) {
  return GENERIC_OFFER_NAME.test(value.trim().replace(/\s+/g, " "));
}
function platform(html: string, url: URL): string {
  const source = `${html.slice(0, 100_000)} ${url.hostname}`.toLowerCase();
  return /tiendanube|nuvemshop/.test(source)
    ? "Tiendanube"
    : /shopify/.test(source)
      ? "Shopify"
      : /woocommerce|wp-content/.test(source)
        ? "WooCommerce"
        : "Sitio web";
}
function pageType(url: URL): string {
  const path = url.pathname.toLowerCase();
  return /producto|product|shop|tienda|catalog/.test(path)
    ? "product"
    : /servicio|service|especialidad|tratamiento/.test(path)
      ? "service"
      : /faq|preguntas/.test(path)
        ? "faq"
        : /nosotros|about|empresa/.test(path)
          ? "about"
          : /contact|contacto/.test(path)
            ? "contact"
            : "other";
}
function schemaObjects(value: unknown): Record<string, any>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(schemaObjects);
  const object = value as Record<string, any>;
  return [object, ...Object.values(object).flatMap(schemaObjects)];
}
function textFromValue(value: unknown): string {
  return Array.isArray(value)
    ? value.map(textFromValue).filter(Boolean).join(", ")
    : typeof value === "string"
      ? cleanText(value)
      : "";
}
function toOffering(
  raw: Record<string, any>,
  kind: OfferingKind,
  url: string,
  index: number,
): OnboardingOffering | null {
  const name = textFromValue(raw.name);
  if (!name || isGenericOfferingName(name)) return null;
  const offer = raw.offers || raw.offer || {},
    availability =
      String(offer.availability || "").replace(
        /^https?:\/\/schema\.org\//,
        "",
      ) || "Por confirmar",
    price =
      [offer.priceCurrency, offer.price].filter(Boolean).join(" ") ||
      "Por confirmar";
  return {
    id: String(raw.sku || raw.url || `${kind}-${index}`).slice(0, 180),
    kind,
    name: name.slice(0, 180),
    category: textFromValue(raw.category).slice(0, 160),
    description: textFromValue(raw.description).slice(0, 3000),
    specs: Array.isArray(raw.additionalProperty)
      ? raw.additionalProperty
          .map((item: any) => `${item.name || ""}: ${item.value || ""}`)
          .filter(Boolean)
          .join(" · ")
          .slice(0, 3000)
      : "",
    scope: textFromValue(raw.serviceOutput).slice(0, 1500),
    modality: textFromValue(raw.availableChannel).slice(0, 500),
    audience: textFromValue(raw.audience).slice(0, 500),
    price,
    availability,
    url: textFromValue(raw.url) || url,
    selected: true,
    evidence: { url, status: "extracted", confidence: "high" },
  };
}
function parsePage(url: URL, html: string): WebsitePage {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,nav,footer,header,form,iframe").remove();
  const title = cleanText($("title").first().text() || $("h1").first().text()),
    description = cleanText(
      $("meta[name='description']").attr("content") ||
        $("meta[property='og:description']").attr("content") ||
        "",
    );
  const structured = $("script[type='application/ld+json']")
    .toArray()
    .flatMap((node) => {
      try {
        return schemaObjects(JSON.parse($(node).text()));
      } catch {
        return [];
      }
    });
  const offerings = structured.flatMap((item, index) => {
    const types = Array.isArray(item["@type"])
      ? item["@type"]
      : [item["@type"]];
    if (types.includes("Product"))
      return [toOffering(item, "product", url.toString(), index)].filter(
        Boolean,
      ) as OnboardingOffering[];
    if (types.some((type: string) => /Service/i.test(type)))
      return [toOffering(item, "service", url.toString(), index)].filter(
        Boolean,
      ) as OnboardingOffering[];
    return [];
  });
  const kind = pageType(url);
  if (
    !offerings.length &&
    (kind === "product" || kind === "service") &&
    title &&
    !isGenericOfferingName(title)
  )
    offerings.push({
      id: url.toString(),
      kind,
      name: title,
      category: "",
      description:
        description ||
        cleanText($("main,article").first().text()).slice(0, 1500),
      specs: "",
      scope: "",
      modality: "",
      audience: "",
      price: "Por confirmar",
      availability: "Por confirmar",
      url: url.toString(),
      selected: true,
      evidence: {
        url: url.toString(),
        status: "extracted",
        confidence: "medium",
      },
    });
  const socialNetworks = $("a[href]")
    .toArray()
    .flatMap((anchor) => {
      try {
        const hostname = new URL(
          $(anchor).attr("href") || "",
          url,
        ).hostname.replace(/^www\./, "");
        return SOCIAL_HOSTS[hostname] ? [SOCIAL_HOSTS[hostname]] : [];
      } catch {
        return [];
      }
    });
  const text = cleanText(
    `${description} ${$("main,article,body").first().text()}`,
  );
  return {
    url: url.toString(),
    title,
    description,
    text,
    pageType: kind,
    offerings,
    socialNetworks: [...new Set(socialNetworks)],
    platform: platform(html, url),
    hash: createHash("sha256").update(text).digest("hex"),
  };
}
function candidateUrls(html: string, base: URL): string[] {
  const $ = cheerio.load(html);
  const links = $("a[href]")
    .toArray()
    .flatMap((anchor) => {
      try {
        const next = new URL($(anchor).attr("href") || "", base);
        return next.hostname === base.hostname &&
          !BLOCKED_PATH.test(next.pathname) &&
          /^https?:$/.test(next.protocol)
          ? [next.toString().replace(/#.*$/, "")]
          : [];
      } catch {
        return [];
      }
    });
  return [...new Set(links)]
    .sort(
      (a, b) =>
        Number(
          /producto|product|servicio|service|faq|preguntas|nosotros|about|catalog|tienda/i.test(
            b,
          ),
        ) -
        Number(
          /producto|product|servicio|service|faq|preguntas|nosotros|about|catalog|tienda/i.test(
            a,
          ),
        ),
    );
}
function sitemapUrls(xml: string, base: URL): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("url > loc, sitemap > loc")
    .toArray()
    .flatMap((node) => {
      try {
        const next = new URL($(node).text().trim());
        return next.hostname === base.hostname &&
          !BLOCKED_PATH.test(next.pathname)
          ? [next.toString()]
          : [];
      } catch {
        return [];
      }
    });
}

/** Elige una muestra chica y representativa de páginas para el prompt: portada, "Nosotros", FAQ y ofertas de distintas categorías. */
export function selectPagesForPrompt(pages: WebsitePage[]): WebsitePage[] {
  const [home, ...rest] = pages;
  if (!home) return pages.slice(0, MAX_PROMPT_PAGES);
  const about = rest.filter((page) => page.pageType === "about").slice(0, 1);
  const faq = rest.filter((page) => page.pageType === "faq").slice(0, 1);
  const usedUrls = new Set([home.url, ...about.map((page) => page.url), ...faq.map((page) => page.url)]);
  const offeringPages = rest.filter(
    (page) => !usedUrls.has(page.url) && page.offerings.length > 0,
  );
  const seenCategories = new Set<string>();
  const diverseOfferingPages: WebsitePage[] = [];
  for (const page of offeringPages) {
    const category = page.offerings[0]?.category.trim() || page.pageType;
    if (seenCategories.has(category)) continue;
    seenCategories.add(category);
    diverseOfferingPages.push(page);
  }
  const remainingSlots = Math.max(0, MAX_PROMPT_PAGES - 1 - about.length - faq.length);
  return [home, ...about, ...faq, ...diverseOfferingPages.slice(0, remainingSlots)];
}

const STOPWORDS = new Set([
  "para", "con", "desde", "este", "esta", "estos", "estas", "como", "entre",
  "segun", "tiene", "tienen", "sobre", "donde", "hacia", "http", "https",
  "www", "tienda", "online", "productos", "producto", "servicios", "servicio",
  "comprar", "compra", "envio", "envios", "precio", "precios", "todo", "todos",
]);

function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Resumen estructurado de lo que se sabe del negocio, construido antes de armar el prompt. */
export function summarizeForPrompt(pages: WebsitePage[]): BusinessSignals {
  const home = pages[0];
  const offerings = pages.flatMap((page) => page.offerings);
  const categoryCounts = new Map<string, number>();
  for (const item of offerings) {
    const category = item.category.trim();
    if (!category) continue;
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }
  const categories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
  const useCaseText = offerings
    .map((item) => `${item.scope} ${item.audience} ${item.description}`)
    .join(" ");
  const words = normalizeWord(useCaseText)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
  const frequency = new Map<string, number>();
  for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1);
  const dominantTerms = [...frequency.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term);
  const repeatedUses = [
    ...new Set(offerings.map((item) => item.scope.trim()).filter(Boolean)),
  ].slice(0, 5);
  const representativeProducts = [
    ...new Set(offerings.map((item) => item.name)),
  ].slice(0, 10);
  return {
    candidateBrand: home?.title.split(/[|–—-]/)[0].trim() || "",
    categories,
    repeatedUses,
    dominantTerms,
    representativeProducts,
  };
}

function normalizeForBrandMatch(value: string): string {
  return normalizeWord(value)
    .replace(/\b(tienda online de|tienda de|tienda online|tienda|shop online|shop|store)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mapea un nombre de marca detectado en el sitio a una marca ya confirmada del cliente, para no crear duplicados. */
export function matchConfirmedBrand(
  candidate: string,
  confirmedBrands: string[],
): string | null {
  const normalizedCandidate = normalizeForBrandMatch(candidate);
  if (!normalizedCandidate) return null;
  for (const brand of confirmedBrands) {
    const normalizedBrand = normalizeForBrandMatch(brand);
    if (!normalizedBrand) continue;
    if (
      normalizedCandidate === normalizedBrand ||
      normalizedCandidate.includes(normalizedBrand) ||
      normalizedBrand.includes(normalizedCandidate)
    )
      return brand;
  }
  return null;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Público objetivo derivado de categorías/temas reales, sin depender de la IA ni de nombres de producto. */
export function semanticAudienceFallback(draft: {
  offerings: OnboardingOffering[];
  topics: string[];
}): string {
  const categories = [
    ...new Set(draft.offerings.map((item) => item.category.trim()).filter(Boolean)),
  ];
  const source = categories.length ? categories : draft.topics.filter(Boolean);
  if (!source.length) return "";
  return `Personas interesadas en ${joinList(source.slice(0, 3))}.`;
}

/** Detecta si un texto generado por la IA terminó copiando inventario en vez de describir personas. */
export function containsOfferingLeak(
  text: string,
  offerings: OnboardingOffering[],
): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  if (/\bart[íi]culo?\s*\d+|\bsku\b|\$\s?\d/i.test(text)) return true;
  return offerings.some((item) => {
    const name = item.name.trim().toLowerCase();
    return name.length > 3 && normalized.includes(name);
  });
}

async function requestSuggestedFields(
  config: LLMConfig,
  pages: WebsitePage[],
  signals: BusinessSignals,
  context: ConfirmedClientContext,
  correctivePrompt?: string,
): Promise<{ data: any } | null> {
  const selected = selectPagesForPrompt(pages);
  const source = selected
    .map(
      (page) =>
        `URL: ${page.url}\nTÍTULO: ${page.title}\nTEXTO: ${page.text.slice(0, 1800)}`,
    )
    .join("\n\n");
  const summaryBlock = [
    `Marca candidata: ${signals.candidateBrand || "sin datos"}`,
    `Categorías detectadas: ${signals.categories.map((item) => `${item.name} (${item.count})`).join(", ") || "sin datos"}`,
    `Usos repetidos: ${signals.repeatedUses.join(", ") || "sin datos"}`,
    `Términos dominantes: ${signals.dominantTerms.join(", ") || "sin datos"}`,
    `Productos representativos: ${signals.representativeProducts.join(", ") || "sin datos"}`,
  ].join("\n");
  const confirmedBlock =
    context.name || context.brands.length || context.description
      ? `Configuración YA CONFIRMADA de este negocio (prioritaria: el sitio sólo puede proponer cambios, nunca reemplazarla sin justificación): nombre "${context.name}", marcas: ${context.brands.join(", ") || "ninguna"}, descripción: "${context.description}", palabras clave: ${context.domainKeywords.join(", ") || "ninguna"}.`
      : "";
  const systemPrompt = [
    "Respondé JSON con name, description, brand, offer, targetAudience, businessGoals, topics (máximo 5), claims (máximo 5), limits (máximo 5), tone y knowledge (arreglo de exactamente 3 strings: 1) qué problema resuelve el negocio, 2) qué debería considerar alguien al elegir una opción, 3) una pregunta frecuente útil con su respuesta).",
    "targetAudience describe personas y sus actividades o necesidades (ejemplo: 'Personas que practican running y trail'). Nunca copies nombres de producto, SKUs, artículos, precios ni títulos de catálogo en targetAudience.",
    "Usá el resumen estructurado de categorías, usos y términos dominantes para inferir el público y las categorías; no el listado de productos.",
    confirmedBlock,
    "description debe ser una sola oración de hasta 280 caracteres; offer debe resumir categorías y no listar todo el catálogo.",
    "Ignorá navegación, cookies, login, carrito, checkout, precios, descuentos, envíos, banners y textos repetitivos.",
    "Si no hay contexto suficiente para un dato, devolvelo vacío. No inventes precio, stock, garantía, características técnicas ni resultados.",
    correctivePrompt || "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const { response } = await fetchChatCompletion(
      config,
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `RESUMEN ESTRUCTURADO:\n${summaryBlock}\n\nPÁGINAS:\n${source}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 900,
      },
      "Cafishia - análisis de onboarding",
      context,
    );
    if (!response.ok) {
      await logger.warn(
        "onboarding_llm_http_error",
        `El proveedor de IA respondió ${response.status} durante el análisis de onboarding.`,
        { status: response.status },
      );
      return null;
    }
    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content;
    try {
      return { data: JSON.parse(raw || "{}") };
    } catch (error) {
      await logger.warn(
        "onboarding_llm_invalid_json",
        "La IA devolvió una respuesta que no es JSON válido durante el onboarding.",
        { raw, error: error instanceof Error ? error.message : String(error) },
      );
      return null;
    }
  } catch (error) {
    await logger.warn(
      "onboarding_llm_connection_error",
      "No se pudo contactar al proveedor de IA durante el análisis de onboarding.",
      { error: error instanceof Error ? error.message : String(error) },
    );
    return null;
  }
}

export async function suggestedFields(
  pages: WebsitePage[],
  offerings: OnboardingOffering[],
  context: ConfirmedClientContext,
): Promise<Partial<OnboardingDraft>> {
  const config = resolveLLMConfig(context);
  if (!config.apiKey) return {};
  const signals = summarizeForPrompt(pages);

  const parseResult = (data: any): Partial<OnboardingDraft> => {
    const knowledge = Array.isArray(data.knowledge)
      ? [0, 1, 2].map((index) => clipped(data.knowledge[index], 2000))
      : [];
    const targetAudienceRaw = clipped(data.targetAudience, 800);
    const rejected = containsOfferingLeak(targetAudienceRaw, offerings);
    if (rejected) {
      void logger.warn(
        "onboarding_llm_validation_rejected",
        "targetAudience de la IA copiaba nombres de producto, SKU o precios; se descartó.",
        { targetAudience: targetAudienceRaw },
      );
    }
    return {
      name: clipped(data.name, 160),
      description: clipped(data.description, 2000),
      brand: clipped(data.brand, 160),
      offer: clipped(data.offer, 800),
      targetAudience: rejected ? "" : targetAudienceRaw,
      businessGoals: strings(data.businessGoals, 3).map((item) => clipped(item, 240)),
      tone: clipped(data.tone, 160),
      topics: strings(data.topics, 5),
      claims: strings(data.claims, 5),
      limits: strings(data.limits, 5),
      ...(knowledge.some(Boolean) ? { knowledge } : {}),
    };
  };

  const isLowQuality = (result: Partial<OnboardingDraft>) =>
    !result.targetAudience && !result.offer && !result.description;

  const first = await requestSuggestedFields(config, pages, signals, context);
  let parsed = first ? parseResult(first.data) : {};
  if (!first || isLowQuality(parsed)) {
    const retry = await requestSuggestedFields(
      config,
      pages,
      signals,
      context,
      "El intento anterior devolvió datos vacíos, genéricos o copiaba nombres de producto. Generá una síntesis nueva enfocada en categorías, usos y personas, apoyada en el resumen estructurado.",
    );
    if (retry) parsed = parseResult(retry.data);
  }
  return parsed;
}
export function generatedKnowledge(
  draft: Required<OnboardingDraft>,
  kind: string,
) {
  const brand = draft.brand || draft.name || "La marca",
    offer = draft.offer || "su oferta",
    topic = draft.topics[0] || "la necesidad de cada persona";
  if (kind === "Problema que resolvemos")
    return `${brand} ayuda a quienes buscan ${topic} mediante ${offer}.`;
  if (kind === "Cómo elegir una opción")
    return `Para elegir una opción, ${brand} primero entiende el uso esperado y compara alternativas según ${topic}.`;
  return `Una pregunta frecuente es cómo saber si ${offer} es adecuado. ${brand} debe pedir contexto antes de recomendar.`;
}

/**
 * Convierte lo que pudo leerse del sitio en una propuesta utilizable. Sólo
 * completa huecos; nunca reemplaza texto que ya fue confirmado o editado.
 */
export function fillOnboardingDraftGaps(
  value: OnboardingDraft | Required<OnboardingDraft>,
  sourceUrl = "",
): Required<OnboardingDraft> {
  const draft = sanitizeDraft(value);
  const offer = draft.offer || fallbackOffer(draft.offerings);
  const hasBusinessContext = Boolean(
    offer || draft.description.trim() || draft.offerings.length,
  );
  const firstTopic = offer
    .replace(/^(productos?|servicios?)\s+(de|para)\s+/i, "")
    .trim()
    .slice(0, 120);
  const inferredEvidence = (key: string): OnboardingEvidence | undefined =>
    draft.evidence[key] ||
    (sourceUrl
      ? { url: sourceUrl, status: "suggested", confidence: "medium" }
      : undefined);
  const topics = draft.topics.length
    ? draft.topics
    : firstTopic
      ? [firstTopic]
      : [];
  const completed: Required<OnboardingDraft> = {
    ...draft,
    offer,
    targetAudience:
      draft.targetAudience ||
      (hasBusinessContext
        ? semanticAudienceFallback({ offerings: draft.offerings, topics: draft.topics })
        : ""),
    businessGoals:
      draft.businessGoals.length || !hasBusinessContext
        ? draft.businessGoals
        : ["Orientar consultas y ayudar a elegir la opción adecuada"],
    topics,
    evidence: { ...draft.evidence },
  };
  const missingKeys = [
    !draft.offer && "offer",
    !draft.targetAudience && completed.targetAudience && "targetAudience",
    !draft.businessGoals.length && completed.businessGoals.length && "businessGoals",
    !draft.topics.length && completed.topics.length && "topics",
  ].filter(Boolean) as string[];
  for (const key of missingKeys) {
    const item = inferredEvidence(key);
    if (item) completed.evidence[key] = item;
  }
  if (hasBusinessContext) {
    completed.knowledge = completed.knowledge.map((item, index) =>
      item || generatedKnowledge(completed, completed.knowledgePrompts[index]),
    );
    if (completed.knowledge.some(Boolean) && !completed.evidence.knowledge) {
      const item = inferredEvidence("knowledge");
      if (item) completed.evidence.knowledge = item;
    }
  }
  return sanitizeDraft(completed);
}
export async function analyzePublicWebsite(
  value: string,
  clientContext: ConfirmedClientContext | string,
  options: WebsiteAnalysisOptions = {},
): Promise<WebsiteAnalysis> {
  const context: ConfirmedClientContext =
    typeof clientContext === "string"
      ? { name: clientContext, brands: [], description: "", domainKeywords: [] }
      : clientContext;
  const clientName = context.name;
  const startedAt = Date.now(),
    initial = await assertPublicUrl(normalizeWebsiteUrl(value)),
    warnings: string[] = [],
    pages: WebsitePage[] = [];
  let homeResult: { url: URL; html: string };
  try {
    homeResult = await safeFetch(initial, startedAt);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "No pudimos leer el sitio.",
    );
  }
  let robotsText = "";
  try {
    const robots = await safeFetch(
      new URL("/robots.txt", homeResult.url),
      startedAt,
    );
    robotsText = robots.html;
    if (!robotsAllows(robots.html, homeResult.url.pathname))
      throw new Error("El sitio no autoriza el análisis de esta página.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("no autoriza"))
      throw error;
  }
  const home = parsePage(homeResult.url, homeResult.html);
  pages.push(home);
  let sitemap: string[] = [];
  try {
    const source = await safeFetch(
      new URL("/sitemap.xml", homeResult.url),
      startedAt,
    );
    sitemap = sitemapUrls(source.html, homeResult.url);
  } catch {
    // El sitemap es opcional; los enlaces de la portada siguen siendo suficientes.
  }
  const allCandidates = [
    ...new Set([...candidateUrls(homeResult.html, homeResult.url), ...sitemap]),
  ]
    // La portada ya se agregó a `pages` arriba; si el sitemap o los enlaces la
    // repiten, filtrarla acá evita una entrada duplicada (viola el unique de OnboardingSourcePage).
    .filter((candidate) => candidate !== home.url)
    .filter((candidate) =>
      robotsAllows(robotsText, new URL(candidate).pathname),
    );
  const discoveredCandidates = allCandidates.slice(0, MAX_DISCOVERED_CANDIDATES);
  const candidateOffset = Math.max(0, Math.floor(options.candidateOffset || 0));
  const candidates = discoveredCandidates.slice(
    candidateOffset,
    candidateOffset + MAX_PAGES - 1,
  );
  for (
    let i = 0;
    i < candidates.length &&
    pages.length < MAX_PAGES &&
    Date.now() - startedAt < TOTAL_TIMEOUT;
    i += 4
  ) {
    const batch = await Promise.all(
      candidates.slice(i, i + 4).map(async (candidate) => {
        try {
          const result = await safeFetch(new URL(candidate), startedAt);
          return parsePage(result.url, result.html);
        } catch {
          return null;
        }
      }),
    );
    pages.push(...batch.filter((page): page is WebsitePage => Boolean(page)));
  }
  // Dos candidatos distintos pueden redirigir a la misma URL final: dedupear
  // defensivamente antes de persistir OnboardingSourcePage (unique por url).
  const seenPageUrls = new Set<string>();
  const dedupedPages = pages.filter((page) => {
    if (seenPageUrls.has(page.url)) return false;
    seenPageUrls.add(page.url);
    return true;
  });
  pages.length = 0;
  pages.push(...dedupedPages);
  const uniqueOffers = new Map<string, OnboardingOffering>();
  pages
    .flatMap((page) => page.offerings)
    .forEach((item) =>
      uniqueOffers.set(
        `${item.kind}:${item.url}:${item.name}`.toLowerCase(),
        item,
      ),
    );
  const offerings = [...uniqueOffers.values()].slice(0, 100),
    products = offerings.filter((item) => item.kind === "product").length,
    services = offerings.filter((item) => item.kind === "service").length,
    detectedBusinessType =
      products && services
        ? "mixed"
        : products
          ? "products"
          : services
            ? "services"
            : "mixed";
  const firstHeading = home.title.split(/[|–—-]/)[0].trim();
  const matchedBrand = matchConfirmedBrand(firstHeading, context.brands);
  const deterministic: Required<OnboardingDraft> = {
    ...defaultDraft(clientName),
    name: context.name || firstHeading || clientName,
    brand: matchedBrand || firstHeading || clientName,
    description: context.description || cleanBusinessSummary(home.description),
    offer: fallbackOffer(offerings),
    detectedBusinessType,
    detectedPlatform: home.platform,
    offerings,
    selectedNetworks: [
      ...new Set(pages.flatMap((page) => page.socialNetworks)),
    ],
    evidence: {
      name: {
        url: home.url,
        status: context.name ? "manual" : "extracted",
        confidence: home.title ? "high" : "low",
      },
      description: {
        url: home.url,
        status: context.description ? "manual" : "extracted",
        confidence: home.description ? "medium" : "low",
      },
      offer: {
        url: offerings[0]?.url || home.url,
        status: offerings.length ? "extracted" : "needs_confirmation",
        confidence: offerings.length ? "medium" : "low",
      },
      brand: {
        url: home.url,
        status: matchedBrand ? "manual" : "suggested",
        confidence: matchedBrand ? "high" : "medium",
      },
    },
    warnings,
    stats: {
      pagesRead: pages.length,
      pagesDiscarded: Math.max(0, candidates.length - pages.length + 1),
      products,
      services,
      catalogSyncPending:
        allCandidates.length > candidateOffset + candidates.length,
      catalogNextOffset: candidateOffset + candidates.length,
      durationMs: Date.now() - startedAt,
    },
  };
  const suggested = options.skipSuggestions
      ? {}
      : await suggestedFields(pages, offerings, context),
    merged = sanitizeDraft(
      {
        ...deterministic,
        ...Object.fromEntries(
          Object.entries(suggested).filter(([, item]) =>
            Array.isArray(item) ? item.length : Boolean(item),
          ),
        ),
        evidence: {
          ...deterministic.evidence,
          ...Object.fromEntries(
            Object.keys(suggested)
              .filter((key) => (suggested as any)[key])
              .map((key) => [
                key,
                { url: home.url, status: "suggested", confidence: "medium" },
              ]),
          ),
        },
      },
      clientName,
    );
  if (!suggested.description && !suggested.offer && !context.description) {
    warnings.push(
      "No pudimos generar un resumen comercial confiable; completá qué vende, público y objetivos manualmente.",
    );
  }
  if (!offerings.length)
    warnings.push(
      "No detectamos un catálogo estructurado. Podés agregar una oferta principal si querés.",
    );
  const completed = fillOnboardingDraftGaps(
    { ...merged, warnings, stats: deterministic.stats },
    home.url,
  );
  return {
    draft: completed,
    pages,
    warning: warnings.join(" ") || undefined,
  };
}

export function mergeManualFields(
  fresh: Required<OnboardingDraft>,
  previous: Required<OnboardingDraft>,
): Required<OnboardingDraft> {
  const merged: Required<OnboardingDraft> = { ...fresh };
  for (const field of previous.manualFields) {
    if (field.startsWith("offering:")) continue;
    const key = field as keyof OnboardingDraft;
    if (!(key in previous)) continue;
    (merged as any)[key] = (previous as any)[key];
    if (previous.evidence[field])
      merged.evidence = { ...merged.evidence, [field]: previous.evidence[field] };
  }
  const manualOfferings = previous.offerings.filter(
    (item) => item.evidence.status === "manual",
  );
  const manualIds = new Set(manualOfferings.map((item) => item.id));
  merged.offerings = [
    ...fresh.offerings.filter((item) => !manualIds.has(item.id)),
    ...manualOfferings,
  ];
  merged.manualFields = [
    ...new Set([...fresh.manualFields, ...previous.manualFields]),
  ];
  return merged;
}

/** El nombre del draft ya lo tiene otro cliente; `syncOnboarding` no puede activar así. */
export class OnboardingNameConflictError extends Error {
  constructor(public readonly conflictingName: string) {
    super(
      `Ya existe otro cliente con el nombre "${conflictingName}". Ajustá el nombre en el paso Revisar antes de activar.`,
    );
    this.name = "OnboardingNameConflictError";
  }
}

async function syncCatalogOfferings(
  tx: any,
  clientId: string,
  draft: Required<OnboardingDraft>,
) {
  if (!draft.brand.trim())
    return { brand: null, products: 0, services: 0 };
  const brand = await tx.brand.upsert({
    where: { clientId_name: { clientId, name: draft.brand } },
    create: {
      clientId,
      name: draft.brand,
      strengths: draft.offer,
      tone: draft.tone,
      allowedClaims: draft.claims.join("\n"),
      forbiddenClaims: draft.limits.join("\n"),
    },
    update: {
      strengths: draft.offer,
      tone: draft.tone,
      allowedClaims: draft.claims.join("\n"),
      forbiddenClaims: draft.limits.join("\n"),
    },
  });
  let products = 0;
  let services = 0;
  for (const item of draft.offerings) {
    if (!item.selected) continue;
    if (item.kind === "product") {
      products += 1;
      await tx.product.upsert({
        where: { brandId_name: { brandId: brand.id, name: item.name } },
        create: {
          brandId: brand.id,
          name: item.name,
          category: item.category,
          description: item.description,
          technicalSpecs: item.specs,
          useCases: item.scope,
          stockStatus: item.availability,
          priceRange: item.price,
          sourceType: "website",
          sourceExternalId: item.id,
          sourceUrl: item.url,
          sourceSnapshotAt: new Date(),
        },
        update: {
          category: item.category,
          description: item.description,
          technicalSpecs: item.specs,
          useCases: item.scope,
          stockStatus: item.availability,
          priceRange: item.price,
          sourceType: "website",
          sourceExternalId: item.id,
          sourceUrl: item.url,
          sourceSnapshotAt: new Date(),
        },
      });
    } else {
      services += 1;
      await (tx as any).service.upsert({
        where: { brandId_name: { brandId: brand.id, name: item.name } },
        create: {
          brandId: brand.id,
          name: item.name,
          category: item.category,
          description: item.description,
          scope: item.scope,
          modality: item.modality,
          audience: item.audience,
          priceRange: item.price,
          availabilityNotes: item.availability,
          sourceType: "website",
          sourceExternalId: item.id,
          sourceUrl: item.url,
          sourceSnapshotAt: new Date(),
        },
        update: {
          category: item.category,
          description: item.description,
          scope: item.scope,
          modality: item.modality,
          audience: item.audience,
          priceRange: item.price,
          availabilityNotes: item.availability,
          sourceType: "website",
          sourceExternalId: item.id,
          sourceUrl: item.url,
          sourceSnapshotAt: new Date(),
        },
      });
    }
  }
  return { brand, products, services };
}

export async function syncOnboardingCatalog(
  prisma: PrismaClient,
  clientId: string,
  draftInput: Required<OnboardingDraft>,
) {
  const draft = sanitizeDraft(draftInput);
  return prisma.$transaction((tx) => syncCatalogOfferings(tx, clientId, draft));
}

/** `draftValue` es literalmente igual a `domainValue`, o es el prefijo que quedó
 * después de que sanitizeDraft cortara un valor más largo en `limit`. En ese
 * caso escribir `draftValue` de vuelta sería una regresión silenciosa por
 * clipping, así que también cuenta como "sin cambios". */
function unchangedString(draftValue: string, domainValue: string, limit?: number): boolean {
  if (draftValue === domainValue) return true;
  if (!limit) return false;
  return (
    draftValue.length === limit &&
    domainValue.length > limit &&
    domainValue.startsWith(draftValue)
  );
}
function unchangedList(draftValue: string[], domainValue: string[], limit?: number): boolean {
  const draftJson = JSON.stringify(draftValue);
  if (draftJson === JSON.stringify(domainValue)) return true;
  if (!limit || draftValue.length !== limit || domainValue.length <= limit) return false;
  return draftJson === JSON.stringify(domainValue.slice(0, limit));
}
function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqualJson(item, b[index]))
    );
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    return (
      keysA.length === keysB.length &&
      keysA.every((key) => deepEqualJson((a as any)[key], (b as any)[key]))
    );
  }
  return false;
}

export type SyncOnboardingOptions = {
  /** Cuando se pasa, además de sincronizar el catálogo marca este onboarding como COMPLETED dentro de la misma transacción. */
  completeOnboardingId?: string;
};

export async function syncOnboarding(
  prisma: PrismaClient,
  clientId: string,
  draftInput: Required<OnboardingDraft>,
  options: SyncOnboardingOptions = {},
) {
  const draft = sanitizeDraft(draftInput);
  await prisma.$transaction(async (tx) => {
    const currentClient = await tx.client.findUnique({
      where: { id: clientId },
      select: { name: true, description: true, domainKeywords: true, responsePolicy: true },
    });
    // Un draft congelado con un nombre que otro cliente ya tomó no debe reventar
    // la transacción con un P2002 críptico: se detecta antes y se informa.
    if (draft.name && currentClient && draft.name !== currentClient.name) {
      const conflict = await tx.client.findFirst({
        where: { name: draft.name, NOT: { id: clientId } },
        select: { id: true },
      });
      if (conflict) throw new OnboardingNameConflictError(draft.name);
    }
    // responsePolicy tiene dos dueños con claves disjuntas (ver ResponsePolicy en
    // response-policy.ts): mergear en vez de reemplazar preserva lo que otra
    // pantalla haya escrito ahí.
    const existingPolicy =
      currentClient?.responsePolicy &&
      typeof currentClient.responsePolicy === "object" &&
      !Array.isArray(currentClient.responsePolicy)
        ? (currentClient.responsePolicy as Record<string, unknown>)
        : {};
    // Escritura diferencial: sólo se tocan los campos que cambiaron respecto a
    // lo ya confirmado. Hace que reactivar sin editar nada sea un no-op real
    // (no sólo "por construcción" vía rehidratación) y evita que un valor
    // truncado por el clipping de sanitizeDraft pise al original más largo.
    const clientData: Record<string, unknown> = {};
    if (draft.name && (!currentClient || draft.name !== currentClient.name)) {
      clientData.name = draft.name;
    }
    if (!currentClient || !unchangedString(draft.description, currentClient.description, 2000)) {
      clientData.description = draft.description;
    }
    if (
      !currentClient ||
      !unchangedList(draft.topics, parseDomainKeywords(currentClient.domainKeywords), 40)
    ) {
      clientData.domainKeywords = JSON.stringify(draft.topics);
    }
    const mergedPolicy = {
      ...existingPolicy,
      tone: draft.tone,
      claims: draft.claims,
      limits: draft.limits,
      targetAudience: draft.targetAudience,
      businessGoals: draft.businessGoals,
    };
    if (!deepEqualJson(mergedPolicy, existingPolicy)) {
      clientData.responsePolicy = mergedPolicy;
    }
    if (Object.keys(clientData).length > 0) {
      await tx.client.update({ where: { id: clientId }, data: clientData });
    }
    const catalog = await syncCatalogOfferings(tx, clientId, draft);
    if (catalog.brand) {
      const brand = catalog.brand;
      // Sólo crea las voces que falten; nunca uniforma el tono de personas ya confirmadas.
      for (const name of voices) {
        const existing = await tx.persona.findUnique({
          where: { clientId_name: { clientId, name } },
        });
        if (existing) continue;
        await tx.persona.create({
          data: {
            clientId,
            name,
            role: name,
            tone: draft.tone,
            goals: `Representar a ${draft.brand} con información confirmada.`,
            preferredLength: "Media",
            allowedPhrases: draft.claims.join("\n"),
            forbiddenPhrases: draft.limits.join("\n"),
          },
        });
      }
      if (draft.knowledgeApproved) {
        // Upsert por (clientId, source, topic) en vez de borrar y recrear:
        // preserva ids/createdAt y no destruye una edición hecha en /knowledge
        // que siga en source:"onboarding" para un topic que ya no aplica.
        const existingRows: { id: string; topic: string }[] =
          await tx.knowledgeBase.findMany({
            where: { clientId, source: "onboarding" },
            select: { id: true, topic: true },
          });
        const byTopic = new Map(existingRows.map((row) => [row.topic, row.id]));
        const desiredTopics = new Set<string>();
        for (const [index, content] of draft.knowledge.entries()) {
          if (!content) continue;
          const topic = draft.knowledgePrompts[index] || `Conocimiento ${index + 1}`;
          desiredTopics.add(topic);
          const existingId = byTopic.get(topic);
          if (existingId) {
            await tx.knowledgeBase.update({
              where: { id: existingId },
              data: { content, confidence: "high" },
            });
          } else {
            await tx.knowledgeBase.create({
              data: {
                clientId,
                brandId: brand.id,
                topic,
                content,
                source: "onboarding",
                confidence: "high",
              },
            });
          }
        }
        const staleIds = existingRows
          .filter((row) => !desiredTopics.has(row.topic))
          .map((row) => row.id);
        if (staleIds.length) {
          await tx.knowledgeBase.deleteMany({ where: { id: { in: staleIds } } });
        }
      }
      for (const channel of draft.selectedNetworks) {
        const label = `${clientId}:onboarding:${channel}`;
        const query =
          `${draft.brand || draft.name} ${draft.offer || draft.topics[0] || "consultas"}`.slice(
            0,
            400,
          );
        // Sólo reescribe query/expectedTopics si los temas cambiaron: si alguien
        // afinó el query a mano en /clients, reactivar la fuente no lo pisa.
        const existingSource = await tx.monitoredSource.findUnique({
          where: { label },
          select: { expectedTopics: true },
        });
        const currentTopics = Array.isArray(existingSource?.expectedTopics)
          ? (existingSource!.expectedTopics as unknown[])
          : [];
        const topicsChanged =
          !existingSource ||
          JSON.stringify(currentTopics) !== JSON.stringify(draft.topics);
        await tx.monitoredSource.upsert({
          where: { label },
          create: { clientId, label, channel, query, expectedTopics: draft.topics },
          update: topicsChanged
            ? { active: true, query, expectedTopics: draft.topics }
            : { active: true },
        });
      }
    }
    if (options.completeOnboardingId) {
      await (tx as any).clientOnboarding.update({
        where: { id: options.completeOnboardingId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          currentStep: 3,
          draft,
        },
      });
    }
  });
}

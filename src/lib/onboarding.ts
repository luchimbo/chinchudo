import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import type { PrismaClient } from "@prisma/client";
import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";

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
  tone?: string;
  offer?: string;
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
    durationMs: number;
  };
};
export type WebsitePage = {
  url: string;
  title: string;
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

const voices = ["Técnico", "Práctico", "Innovación", "Educativo", "Comercial"];
const MAX_PAGES = 40,
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
    tone: "Claro y cercano",
    offer: "",
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
    tone: clipped(raw.tone, 160) || base.tone,
    offer: clipped(raw.offer, 800),
    topics: strings(raw.topics, 12),
    claims: strings(raw.claims, 10),
    limits: strings(raw.limits, 10),
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

/**
 * Makes a domain pasted by a person usable as a web URL. The public-address
 * checks still happen in `assertPublicUrl` immediately before any request.
 */
export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
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
  if (!name) return null;
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
  if (!offerings.length && (kind === "product" || kind === "service") && title)
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
    )
    .slice(0, MAX_PAGES - 1);
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
    })
    .slice(0, MAX_PAGES - 1);
}
const KNOWLEDGE_PRIORITY_PAGE_TYPES = new Set(["faq", "about", "contact"]);

async function suggestedFields(
  pages: WebsitePage[],
): Promise<Partial<OnboardingDraft>> {
  const config = resolveLLMConfig();
  if (!config.apiKey) return {};
  const [home, ...rest] = pages;
  const ordered = [
    home,
    ...rest.sort(
      (a, b) =>
        Number(KNOWLEDGE_PRIORITY_PAGE_TYPES.has(b.pageType)) -
        Number(KNOWLEDGE_PRIORITY_PAGE_TYPES.has(a.pageType)),
    ),
  ].filter((page): page is WebsitePage => Boolean(page));
  const source = ordered
    .slice(0, 8)
    .map(
      (page) =>
        `URL: ${page.url}\nTÍTULO: ${page.title}\nTEXTO: ${page.text.slice(0, 1800)}`,
    )
    .join("\n\n");
  try {
    const { response } = await fetchChatCompletion(
      config,
      {
        messages: [
          {
            role: "system",
            content:
              "Extraé únicamente hechos presentes en las fuentes. Respondé JSON con name, description, brand, offer, topics (máximo 5), claims (máximo 5), limits (máximo 5), tone, knowledge (arreglo de exactamente 3 strings, en este orden: 1) qué problema resuelve el negocio para sus clientes, 2) qué debería tener en cuenta alguien para elegir entre sus opciones, 3) una pregunta frecuente real del sitio junto con su respuesta). Si un dato no está respaldado devolvé vacío ('' para cada posición de knowledge que no tenga respaldo). No inventes precio, stock, garantía ni resultados.",
          },
          { role: "user", content: source },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 900,
      },
      "Cafishia - análisis de onboarding",
    );
    if (!response.ok) return {};
    const data = JSON.parse(
      (await response.json()).choices?.[0]?.message?.content || "{}",
    );
    const knowledge = Array.isArray(data.knowledge)
      ? [0, 1, 2].map((index) => clipped(data.knowledge[index], 2000))
      : [];
    return {
      name: clipped(data.name, 160),
      description: clipped(data.description, 2000),
      brand: clipped(data.brand, 160),
      offer: clipped(data.offer, 800),
      tone: clipped(data.tone, 160),
      topics: strings(data.topics, 5),
      claims: strings(data.claims, 5),
      limits: strings(data.limits, 5),
      ...(knowledge.some(Boolean) ? { knowledge } : {}),
    };
  } catch {
    return {};
  }
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
export async function analyzePublicWebsite(
  value: string,
  clientName: string,
): Promise<WebsiteAnalysis> {
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
  const candidates = [
    ...new Set([...candidateUrls(homeResult.html, homeResult.url), ...sitemap]),
  ]
    .filter((candidate) =>
      robotsAllows(robotsText, new URL(candidate).pathname),
    )
    .slice(0, MAX_PAGES - 1);
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
  const deterministic: Required<OnboardingDraft> = {
    ...defaultDraft(clientName),
    name: firstHeading || clientName,
    brand: firstHeading || clientName,
    description: home.text.slice(0, 800),
    offer: offerings[0]?.name || "",
    detectedBusinessType,
    detectedPlatform: home.platform,
    offerings,
    selectedNetworks: [
      ...new Set(pages.flatMap((page) => page.socialNetworks)),
    ],
    evidence: {
      name: {
        url: home.url,
        status: "extracted",
        confidence: home.title ? "high" : "low",
      },
      description: {
        url: home.url,
        status: "extracted",
        confidence: home.text ? "medium" : "low",
      },
      brand: { url: home.url, status: "suggested", confidence: "medium" },
    },
    warnings,
    stats: {
      pagesRead: pages.length,
      pagesDiscarded: Math.max(0, candidates.length - pages.length + 1),
      products,
      services,
      durationMs: Date.now() - startedAt,
    },
  };
  const suggested = await suggestedFields(pages),
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
  if (!offerings.length)
    warnings.push(
      "No detectamos ofertas estructuradas; revisá o agregá productos y servicios manualmente.",
    );
  return {
    draft: { ...merged, warnings, stats: deterministic.stats },
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

export async function syncOnboarding(
  prisma: PrismaClient,
  clientId: string,
  draftInput: Required<OnboardingDraft>,
) {
  const draft = sanitizeDraft(draftInput);
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        name: draft.name || undefined,
        description: draft.description,
        domainKeywords: JSON.stringify(draft.topics),
        responsePolicy: {
          tone: draft.tone,
          claims: draft.claims,
          limits: draft.limits,
        },
      },
    });
    if (!draft.brand.trim()) return;
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
    await Promise.all(
      voices.map((name) =>
        tx.persona.upsert({
          where: { clientId_name: { clientId, name } },
          create: {
            clientId,
            name,
            role: name,
            tone: draft.tone,
            goals: `Representar a ${draft.brand} con información confirmada.`,
            preferredLength: "Media",
            allowedPhrases: draft.claims.join("\n"),
            forbiddenPhrases: draft.limits.join("\n"),
          },
          update: {
            tone: draft.tone,
            allowedPhrases: draft.claims.join("\n"),
            forbiddenPhrases: draft.limits.join("\n"),
          },
        }),
      ),
    );
    for (const item of draft.offerings.filter((offer) => offer.selected)) {
      if (item.kind === "product")
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
      else
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
    if (draft.knowledgeApproved) {
      await tx.knowledgeBase.deleteMany({
        where: { clientId, source: "onboarding" },
      });
      await tx.knowledgeBase.createMany({
        data: draft.knowledge.filter(Boolean).map((content, index) => ({
          clientId,
          brandId: brand.id,
          topic: draft.knowledgePrompts[index] || `Conocimiento ${index + 1}`,
          content,
          source: "onboarding",
          confidence: "high",
        })),
      });
    }
    for (const channel of draft.selectedNetworks) {
      const query =
        `${draft.brand || draft.name} ${draft.offer || draft.topics[0] || "consultas"}`.slice(
          0,
          400,
        );
      await tx.monitoredSource.upsert({
        where: { label: `${clientId}:onboarding:${channel}` },
        create: {
          clientId,
          label: `${clientId}:onboarding:${channel}`,
          channel,
          query,
          expectedTopics: draft.topics,
        },
        update: { query, expectedTopics: draft.topics, active: true },
      });
    }
  });
}

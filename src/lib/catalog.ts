import { readFileSync } from "fs";
import { join } from "path";
import type { Brand, CatalogRule, Product } from "@prisma/client";
import { catalogRuleMatches, normalizeForMatch, parseClientList } from "./catalog-text";
import { mentionsBrand } from "./brand-identity";

export type ProductEntry = {
  id: string;
  nombre: string;
  marca: string;
  modelo: string;
  categoria_id: string;
  url: string;
  uso: string;
  especificaciones?: string;
  descripcion?: string;
  garantia?: string;
};

// El catálogo sólo necesita estas columnas. Mantenerlo explícito evita que una
// nueva columna de procedencia obligue a actualizar fixtures de recomendación.
export type ScopedProduct = Pick<Product, "id" | "brandId" | "name" | "category" | "description" | "technicalSpecs" | "useCases" | "warrantyNotes" | "stockStatus" | "priceRange" | "createdAt" | "updatedAt"> & { brand?: Brand | null };

let cached: ProductEntry[] | null = null;

export function loadCatalog(): ProductEntry[] {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(join(process.cwd(), "data/productos.json"), "utf-8")) as ProductEntry[];
  } catch {
    cached = [];
  }
  return cached;
}

function normalize(text: string): string {
  return normalizeForMatch(text);
}

function categoryId(value: string | null | undefined): string {
  return normalize(value ?? "").replace(/\s+/g, "-");
}

const CATEGORY_HINTS: Record<string, string[]> = {
  "controladores-midi": ["midi", "controlador", "teclado", "keys", "keyboard", "octava"],
  "controladores-pads": ["pad", "drum pad", "launchpad", "beat", "sampler"],
  "interfaces-audio": ["interfaz", "interface", "placa", "audio interface", "asio", "grabacion", "grabar", "latencia"],
  "microfonos-profesionales": ["microfono", "mic", "condensador", "cardioide", "voces", "grabar voz"],
  "microfonos-streaming": ["usb mic", "streaming", "podcast", "microfono usb"],
  "microfonos": ["microfono", "mic", "condenser"],
  "auriculares": ["auricular", "auriculares", "headphones", "monitoreo", "monitor"],
  "monitores-estudio": ["monitor", "altavoz", "parlante", "studio monitor"],
  "sintes-analogicos-hibridos": ["sintetizador", "synth", "sinte", "analogico", "vocoder"],
  "sintetizadores": ["sintetizador", "synth", "sinte"],
  "baterias-electronicas": ["bateria", "drum", "electronica", "parche", "parches"],
  "accesorios-microfonos": ["brazo", "soporte microfono", "pie de microfono"],
};

const PRODUCT_INTENT_HINTS: Record<string, string[]> = {
  "controladores-midi": ["controlador", "midi", "teclado", "piano", "minilab", "akai", "mpk", "teclas", "pads", "knobs", "ableton", "fl studio", "home studio"],
  "interfaces-audio": ["interfaz", "interface", "placa", "audio", "grabar", "latencia", "microfono", "guitarra", "voz"],
  "microfonos": ["microfono", "mic", "condensador", "podcast", "streaming", "voz", "grabar"],
  "microfonos-profesionales": ["microfono", "mic", "condensador", "cardioide", "voz", "estudio"],
  "microfonos-streaming": ["usb", "streaming", "podcast", "gaming", "microfono"],
  "baterias-electronicas": ["bateria", "drum", "parche", "pads", "vecinos", "departamento"],
  "pianos-digitales": ["piano", "88", "hammer", "mueble", "teclas pesadas"],
  "monitores-estudio": ["monitor", "monitores", "parlante", "mezcla", "estudio"],
  "auriculares": ["auricular", "auriculares", "headphones", "monitoreo"],
  "medias-tecnicas-running": ["medias", "running", "correr", "10k", "21k", "ampolla", "rozadura", "roce", "entrenar"],
  "compresion-graduada": ["compresion", "recuperar", "recuperacion", "pantorrilla", "15 20", "mm hg"],
  "tripack": ["pack", "tripack", "combo", "barato", "precio", "promo", "todos los dias"],
  "trail": ["trail", "montana", "barro", "sendero", "media cana", "media caña"],
  "cuarto-de-cana": ["cuarto", "cana", "caña", "gimnasio", "entrenamiento"],
};

type ProductFamily = "interface" | "microphone" | "drums" | "drum-machine" | "headphones" | "monitors" | "pads" | "controller" | "piano" | "organ" | "synth" | "accessory" | "software";

// Lo que la persona dice necesitar. Va por palabra completa: "bateria" sola no
// alcanza porque puede ser acústica, y "monitoreo" no es pedir monitores.
const NEED_PATTERNS: [ProductFamily, RegExp][] = [
  ["interface", /\b(?:interfa(?:z|ces?)(?! midi| de usuario)|placas? de (?:sonido|audio)|placa externa)\b/],
  ["microphone", /\b(?:microfonos?|mics?|condenser|condensador(?:es)?)\b/],
  ["drums", /\b(?:baterias? electronicas?|bateria electrica|octapad|sample pad|parches? de malla|e-?drums?)\b/],
  ["drum-machine", /\b(?:cajas? de ritmos?|maquinas? de ritmos?|drum machines?)\b/],
  ["headphones", /\b(?:auriculares?|headphones?)\b/],
  ["monitors", /\b(?:monitores|parlantes?(?: de estudio)?)\b/],
  ["pads", /\b(?:launchpad|drum pads?|controlador(?:es)? de pads?|finger ?drum\w*)\b/],
  ["controller", /\b(?:controlador(?:es)?|teclados? midi|midi controller)\b/],
  ["piano", /\b(?:pianos? digital(?:es)?|pianos? electricos?)\b/],
  ["organ", /\b(?:organos?|teclados? musical(?:es)?)\b/],
  ["synth", /\b(?:sintetizador(?:es)?|sintes?|synths?)\b/],
];

// El título manda sobre la categoría porque las categorías del catálogo están
// cargadas de forma despareja ("Interfaces", "interfaces-audio", "Micrófonos").
const FAMILY_PATTERNS: [ProductFamily, RegExp][] = [
  ["software", /^software\b/],
  ["accessory", /\b(?:brazo|antipop|pie de|shockmount|pipeta|pantalla|funda|banqueta|soporte|pedal|atril|music stand|wooden legs|rackbrute|amplificador de auriculares|transmisor|midi merge|midilink|interfaz midi|usb midi host|midi interface)\b/],
  ["drum-machine", /\b(?:drumbrute|caja de ritmos|maquina de ritmos)\b/],
  ["drums", /\b(?:bateria|octapad|air drum)\b/],
  ["synth", /\b(?:sintetizador|minifreak|microfreak|polybrute|minibrute|microbrute|astrolab)\b/],
  ["interface", /\b(?:placa|interfa[zc]e? de audio|interface|minifuse|audiofuse|audioface|livedock|livemix)\b/],
  ["microphone", /\b(?:microfono|microfonos|condenser)\b/],
  ["headphones", /\bauriculare?s?\b/],
  ["monitors", /\bmonitores\b/],
  ["pads", /\b(?:tempopad|launchpad)\b/],
  ["piano", /\bpiano digital\b/],
  ["organ", /\b(?:organo|teclado musical|teclado casio)\b/],
  ["controller", /\b(?:controlador|keylab|minilab|microlab|keystep|beatstep|tempokey|teclado midi|minicontrol|keytar)\b/],
];

const NAME_STOPWORDS = new Set(["con", "para", "por", "sin", "los", "las", "del", "kit", "pack", "par", "usb", "midi", "teclas", "teclado", "musical", "black", "white", "negro", "blanco", "edition", "profesional", "estudio", "studio", "audio", "digital"]);
const STORE_LABEL = /^pc midi center$/i;
const BULK_PACK = /\bpack x\s*\d+ unidades\b/;

function needsIn(text: string): Set<ProductFamily> {
  return new Set(NEED_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([family]) => family));
}

function productFamily(name: string): ProductFamily | null {
  const norm = normalize(name);
  return FAMILY_PATTERNS.find(([, pattern]) => pattern.test(norm))?.[0] ?? null;
}

function familyFits(needs: Set<ProductFamily>, family: ProductFamily): boolean {
  return needs.has(family) || (needs.has("controller") && family === "pads");
}

const termPatterns = new Map<string, RegExp>();
/** Coincide desde el inicio de una palabra, para que "audio" no aparezca dentro de otra. */
function hasTerm(text: string, term: string): boolean {
  const key = normalize(term);
  let pattern = termPatterns.get(key);
  if (!pattern) {
    pattern = new RegExp(`(?<![a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    termPatterns.set(key, pattern);
  }
  return pattern.test(text);
}

function modelTokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => /[a-z]/.test(token) && /\d/.test(token));
}

export function matchCategories(sourceText: string, detectedProduct?: Product | null): string[] {
  const norm = normalize(sourceText);
  const cats = Object.entries(CATEGORY_HINTS)
    .filter(([, keywords]) => keywords.some((kw) => norm.includes(normalize(kw))))
    .map(([cat]) => cat);

  if (detectedProduct?.category) {
    const normCat = categoryId(detectedProduct.category);
    if (!cats.includes(normCat)) cats.push(normCat);
  }
  return cats;
}

function productToEntry(product: ScopedProduct): ProductEntry {
  return {
    id: product.id,
    nombre: product.name,
    marca: product.brand?.name ?? "",
    modelo: product.name,
    categoria_id: categoryId(product.category),
    url: "",
    uso: product.useCases || product.description,
    especificaciones: product.technicalSpecs || "",
    descripcion: product.description,
    garantia: product.warrantyNotes,
  };
}

function selectScopedProducts(
  sourceText: string,
  detectedProduct: Product | null,
  max: number,
  catalogProducts: ScopedProduct[],
  catalogRules: Pick<CatalogRule, "category" | "keywords">[] = [],
  scoped = true,
  commentText?: string,
): ProductEntry[] {
  const norm = normalize(sourceText);
  // Lo que pide el comentario pesa más que el tema del video donde se escribió.
  const commentNeeds = needsIn(normalize(commentText ?? ""));
  const needs = commentNeeds.size > 0 ? commentNeeds : needsIn(norm);
  const brandNames = [...new Set(catalogProducts.flatMap((product) => product.brand?.name ? [product.brand.name] : []))];
  const commentWords = new Set(norm.split(/[^a-z0-9+-]+/));
  const asksForPads = /\b(pad|pads|drum pad|launchpad|finger drum|fingerdrum)\b/.test(norm);
  const asksForPadOnly = asksForPads && /\b(sin teclado|en lugar de teclas|pads? instead of|pad based|basado en pads)\b/.test(norm);
  const asksFor88Keys = /\b88\b/.test(norm) && /\b(tecla|teclas|piano|controlador|keyboard)\b/.test(norm);
  const asksForSynth = /\b(sintetizador|sinte|synth)\b/.test(norm);
  const ruleCategories = catalogRuleMatches(sourceText, catalogRules).map(categoryId);
  const detectedCategory = detectedProduct?.category ? categoryId(detectedProduct.category) : "";
  const matchingCategories = new Set([...ruleCategories, detectedCategory].filter(Boolean));

  const scored = catalogProducts.map((product) => {
    const cat = categoryId(product.category);
    const rule = catalogRules.find((item) => categoryId(item.category) === cat);
    const keywords = [
      ...(rule ? parseClientList(rule.keywords) : []),
      ...(PRODUCT_INTENT_HINTS[cat] ?? []),
    ];
    const keywordScore = keywords.filter((kw) => hasTerm(norm, kw)).length;
    const productName = normalize(product.name);
    const productUse = normalize(`${product.category} ${product.description} ${product.useCases}`);
    const productTokens = productName.split(/\s+/).filter((token) => token.length >= 3 && !NAME_STOPWORDS.has(token));
    const modelScore = modelTokens(product.name).filter((token) => commentWords.has(token)).length * 8;
    const nameTokenScore = productTokens.filter((token) => commentWords.has(token)).length;
    const useScore = keywords.filter((kw) => productUse.includes(normalize(kw)) && hasTerm(norm, kw)).length;
    const family = productFamily(product.name);
    const namedDirectly = modelScore > 0 || norm.includes(productName);
    const familyScore = !family || needs.size === 0 || namedDirectly ? 0 : familyFits(needs, family) ? 16 : -14;
    const sideProductPenalty = (family === "accessory" || family === "software") && !namedDirectly && !(family && needs.has(family)) ? -8 : 0;
    const bulkPenalty = BULK_PACK.test(productName) ? -30 : 0;
    // Un título con otro fabricante o cargado bajo la tienda no se puede nombrar bien en público.
    const ownBrand = product.brand?.name ?? "";
    const mislabeled = STORE_LABEL.test(ownBrand) || brandNames.some((name) => name.toLowerCase() !== ownBrand.toLowerCase() && mentionsBrand(product.name, name));
    const labelPenalty = mislabeled ? -20 : 0;
    const categoryScore = matchingCategories.has(cat) ? 4 : 0;
    const productScore = norm.includes(productName) ? 10 : nameTokenScore;
    const brandScore = product.brand?.name && mentionsBrand(sourceText, product.brand.name) ? 5 : 0;
    const exactScore = detectedProduct?.id === product.id ? 10 : 0;
    const wantsKeyboardController = /\b(controlador|controller|minilab|mpk|akai|teclas|pads|knobs)\b/.test(norm);
    const windControllerPenalty = wantsKeyboardController && /\b(flauta|elefue|saxo|viento)\b/.test(productName) ? -8 : 0;
    const minilabLikeBonus = norm.includes("minilab") && /\b(tiny|akm|ak490|controlador|teclado)\b/.test(productName) ? 3 : 0;
    const packIntentBonus = /\b(pack|tripack|combo|barato|precio|promo)\b/.test(norm) && /\b(pack|tripack|combo)\b/.test(productName) ? 10 : 0;
    const compressionIntentBonus = /\b(compresion|compresion|recuperar|recuperacion|15 20|mm hg)\b/.test(norm) && /\b(compresion|15 20|mm hg)\b/.test(productName) ? 10 : 0;
    const trailIntentBonus = /\b(trail|montana|barro|sendero)\b/.test(norm) && /\b(trail)\b/.test(productName) ? 8 : 0;
    const stockPenalty = product.name.toLowerCase().includes("outlet") ? -1 : 0;
    const featureText = normalize(`${product.name} ${product.category} ${product.description} ${product.useCases} ${product.technicalSpecs}`);
    const hasPads = /\bpad|pads|launchpad|finger drum|fingerdrum\b/.test(featureText);
    const isPadFocused = /\b(tempopad|launchpad|controlador basado en \d* ?pads|controlador de pads)\b/.test(featureText);
    const hasKeyboard = /\b(tecla|teclas|keyboard|keylab|keystep)\b/.test(featureText);
    const keyIdentityText = normalize(`${product.name} ${product.category} ${product.useCases} ${product.technicalSpecs}`);
    const has88Keys = /\b88\b/.test(keyIdentityText) && /\btecla|teclas|hammer|contrapesad|keylab\b/.test(keyIdentityText);
    const productIdentity = normalize(`${product.name} ${product.category}`);
    const isSynth = /\b(sintetizador|sintetizadores|sinte|synth)\b/.test(productIdentity)
      && !/\b(controlador|controller|pedal|soporte|funda|accesorio)\b/.test(productIdentity);
    const padCompatibility = asksForPads ? (hasPads ? 14 : -30) : 0;
    const padOnlyCompatibility = asksForPadOnly ? (isPadFocused && !hasKeyboard ? 24 : -24) : 0;
    const keyCompatibility = asksFor88Keys ? (has88Keys ? 16 : -24) : 0;
    const synthCompatibility = asksForSynth ? (isSynth ? 12 : -18) : 0;
    const score = familyScore + sideProductPenalty + bulkPenalty + labelPenalty + exactScore + productScore + modelScore + brandScore + categoryScore + keywordScore + useScore + minilabLikeBonus + packIntentBonus + compressionIntentBonus + trailIntentBonus + windControllerPenalty + stockPenalty + padCompatibility + padOnlyCompatibility + keyCompatibility + synthCompatibility;
    return { product, score };
  });

  const sorted = scored.sort((a, b) => {
    // Cuando existe un producto detectado/elegido, es el ancla del contexto.
    // Sus coincidencias con el texto no deben ser desplazadas por otro modelo
    // que el comentario pueda mencionar al pasar.
    const aIsDetected = a.product.id === detectedProduct?.id;
    const bIsDetected = b.product.id === detectedProduct?.id;
    if (aIsDetected !== bIsDetected) return aIsDetected ? -1 : 1;
    const aBrandMentioned = !!a.product.brand && mentionsBrand(sourceText, a.product.brand.name);
    const bBrandMentioned = !!b.product.brand && mentionsBrand(sourceText, b.product.brand.name);
    if (aBrandMentioned !== bBrandMentioned) return aBrandMentioned ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.product.name.localeCompare(b.product.name);
  });
  return sorted
    // Sin una señal positiva no recomendamos: el orden alfabético nunca debe
    // convertirse accidentalmente en una recomendación comercial.
    .filter(({ score }) => score >= 3)
    .slice(0, max)
    .map(({ product }) => productToEntry(product));
}

export function selectRelevantProducts(
  sourceText: string,
  detectedProduct: Product | null,
  max = 5,
  options?: {
    catalogProducts?: ScopedProduct[];
    catalogRules?: Pick<CatalogRule, "category" | "keywords">[];
    scoped?: boolean;
    /** Texto del comentario, sin el título del video, para priorizar lo que pide la persona. */
    commentText?: string;
  },
): ProductEntry[] {
  if (options?.catalogProducts) {
    return selectScopedProducts(
      sourceText,
      detectedProduct,
      max,
      options.catalogProducts,
      options.catalogRules,
      options.scoped ?? true,
      options.commentText,
    );
  }

  const catalog = loadCatalog();
  if (catalog.length === 0) return [];

  const norm = normalize(sourceText);
  const matchingCategories = matchCategories(sourceText, detectedProduct);
  const relevant = matchingCategories.length > 0
    ? catalog.filter((p) => matchingCategories.includes(p.categoria_id))
    : catalog;

  const sorted = [...relevant].sort((a, b) => {
    const aMatch = norm.includes(normalize(a.marca)) || norm.includes(normalize(a.modelo)) ? 1 : 0;
    const bMatch = norm.includes(normalize(b.marca)) || norm.includes(normalize(b.modelo)) ? 1 : 0;
    return bMatch - aMatch;
  });

  return sorted.slice(0, max);
}

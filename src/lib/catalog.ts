import { readFileSync } from "fs";
import { join } from "path";
import type { Brand, CatalogRule, Product } from "@prisma/client";
import { catalogRuleMatches, normalizeForMatch, parseClientList } from "./client-context";

export type ProductEntry = {
  id: string;
  nombre: string;
  marca: string;
  modelo: string;
  categoria_id: string;
  url: string;
  uso: string;
};

export type ScopedProduct = Product & { brand?: Brand | null };

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

function categoryId(value: string): string {
  return normalize(value).replace(/\s+/g, "-");
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
  "controladores-midi": ["controlador", "midi", "minilab", "akai", "mpk", "teclas", "pads", "knobs", "ableton", "fl studio", "home studio"],
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
  };
}

function selectScopedProducts(
  sourceText: string,
  detectedProduct: Product | null,
  max: number,
  catalogProducts: ScopedProduct[],
  catalogRules: Pick<CatalogRule, "category" | "keywords">[] = [],
  scoped = true,
): ProductEntry[] {
  const norm = normalize(sourceText);
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
    const keywordScore = keywords.filter((kw) => norm.includes(normalize(kw))).length;
    const productName = normalize(product.name);
    const productUse = normalize(`${product.category} ${product.description} ${product.useCases}`);
    const productTokens = productName.split(/\s+/).filter((token) => token.length >= 3);
    const modelScore = modelTokens(product.name).filter((token) => norm.includes(token)).length * 8;
    const nameTokenScore = productTokens.filter((token) => norm.includes(token)).length;
    const useScore = keywords.filter((kw) => productUse.includes(normalize(kw)) && norm.includes(normalize(kw))).length;
    const categoryScore = matchingCategories.has(cat) ? 4 : 0;
    const productScore = norm.includes(productName) ? 10 : nameTokenScore;
    const brandScore = product.brand?.name && norm.includes(normalize(product.brand.name)) ? 5 : 0;
    const exactScore = detectedProduct?.id === product.id ? 10 : 0;
    const wantsKeyboardController = /\b(controlador|controller|minilab|mpk|akai|teclas|pads|knobs)\b/.test(norm);
    const windControllerPenalty = wantsKeyboardController && /\b(flauta|elefue|saxo|viento)\b/.test(productName) ? -8 : 0;
    const minilabLikeBonus = norm.includes("minilab") && /\b(tiny|akm|ak490|controlador|teclado)\b/.test(productName) ? 3 : 0;
    const packIntentBonus = /\b(pack|tripack|combo|barato|precio|promo)\b/.test(norm) && /\b(pack|tripack|combo)\b/.test(productName) ? 10 : 0;
    const compressionIntentBonus = /\b(compresion|compresion|recuperar|recuperacion|15 20|mm hg)\b/.test(norm) && /\b(compresion|15 20|mm hg)\b/.test(productName) ? 10 : 0;
    const trailIntentBonus = /\b(trail|montana|barro|sendero)\b/.test(norm) && /\b(trail)\b/.test(productName) ? 8 : 0;
    const stockPenalty = product.name.toLowerCase().includes("outlet") ? -1 : 0;
    return { product, score: exactScore + productScore + modelScore + brandScore + categoryScore + keywordScore + useScore + minilabLikeBonus + packIntentBonus + compressionIntentBonus + trailIntentBonus + windControllerPenalty + stockPenalty };
  });

  const sorted = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.product.name.localeCompare(b.product.name);
  });
  return sorted
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

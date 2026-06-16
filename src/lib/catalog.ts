import { readFileSync } from "fs";
import { join } from "path";
import type { Product } from "@prisma/client";

export type ProductEntry = {
  id: string;
  nombre: string;
  marca: string;
  modelo: string;
  categoria_id: string;
  url: string;
  uso: string;
};

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

// Quita tildes/diacríticos para que "batería" matchee con "bateria"
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Palabras clave por categoría para matchear contra el texto del comentario
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

// Categorías que matchean de verdad con el texto (sin fallback a "todas").
// El router usa esto para no inflar categorías cuando no hay match real.
export function matchCategories(sourceText: string, detectedProduct?: Product | null): string[] {
  const norm = normalize(sourceText);
  const cats = Object.entries(CATEGORY_HINTS)
    .filter(([, keywords]) => keywords.some((kw) => norm.includes(normalize(kw))))
    .map(([cat]) => cat);

  if (detectedProduct?.category) {
    const normCat = detectedProduct.category.toLowerCase().replace(/\s+/g, "-");
    if (!cats.includes(normCat)) cats.push(normCat);
  }
  return cats;
}

export function selectRelevantProducts(
  sourceText: string,
  detectedProduct: Product | null,
  max = 5,
): ProductEntry[] {
  const catalog = loadCatalog();
  if (catalog.length === 0) return [];

  const norm = normalize(sourceText);
  const matchingCategories = matchCategories(sourceText, detectedProduct);

  // Para generación de borradores SÍ conviene un fallback a todo el catálogo
  // (siempre hay algún producto que sugerir aunque no haya match exacto).
  const relevant = matchingCategories.length > 0
    ? catalog.filter((p) => matchingCategories.includes(p.categoria_id))
    : catalog;

  // Priorizar productos cuya marca/modelo aparece en el texto
  const sorted = [...relevant].sort((a, b) => {
    const aMatch = norm.includes(normalize(a.marca)) || norm.includes(normalize(a.modelo)) ? 1 : 0;
    const bMatch = norm.includes(normalize(b.marca)) || norm.includes(normalize(b.modelo)) ? 1 : 0;
    return bMatch - aMatch;
  });

  return sorted.slice(0, max);
}

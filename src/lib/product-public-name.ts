/** A product's catalogue title is useful for matching, but rarely reads well in a comment. */
export type PublicProduct = {
  nombre: string;
  marca: string;
  modelo?: string;
};

type NameContext = { sourceText?: string; productChosenByCm?: boolean };

const COLOR_NAMES = [
  "deep black", "rose quartz", "aqua marine", "light blue", "dark blue",
  "black", "white", "negro", "negra", "blanco", "blanca", "azul", "rojo", "roja",
  "verde", "rosa", "silver", "plateado", "plateada", "champagne", "aquamarine",
  "amarillo", "amarilla", "gris", "gray", "grey", "violeta", "purple", "naranja",
  "marrón", "marron", "flúo", "fluo", "turquesa",
];
const COLOR_PATTERN = new RegExp(`\\b(?:${COLOR_NAMES.map((name) => name.replace(/ /g, "\\s+")).join("|")})\\b`, "i");
const CATALOG_PREFIX = /^(?:(?:preventa|pack\s*x\s*\d+|tripack|combo)\s+|(?:placa de sonido(?: profesional)?(?: usb)?|micr[oó]fono(?: condensador| condenser)?(?: usb)?|auricular(?: profesional)?|brazo articulado para micr[oó]fono de mesa|par monitores de estudio|parlantes monitores de estudio activos|controlador midi|teclado sintetizador|piano digital(?: modular)?|bater[ií]a electr[oó]nica(?: port[aá]til)?(?: octapad)?|sintetizador|launchpad)\s+)+/i;
const DESCRIPTION_START = /\s+(?:controlador|teclado|secuenciador|sintetizador|micr[oó]fono|auricular|monitores?|placa de sonido|interfaz|interface|piano digital|transmisor inal[aá]mbrico|cardioide|soquetes?|con refuerzo|con talonera|art\.?\s*\d+|media ca[nñ]a|\d+\s+(?:pulgadas?|bits?|octavas?))\b/i;
const PUBLIC_DESCRIPTION_SUFFIX = "(?:controlador\\s+midi(?:\\s+\\d+\\s+teclas?)?|teclado\\s+controlador\\s+midi(?:\\s+usb)?(?:\\s+\\d+\\s+octavas?)?|piano\\s+digital(?:\\s+modular)?(?:\\s+\\d+\\s+teclas?)?|micr[oó]fono(?:\\s+condensador)?|placa\\s+de\\s+sonido)";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string): string {
  return value.toLocaleLowerCase("es").replace(/(^|[\s/-])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase("es"));
}

function brandPattern(brand: string): RegExp {
  return new RegExp(`\\b${brand.trim().split(/[\s-]+/).map(escapeRegExp).join("[\\s-]+")}\\b`, "gi");
}

function findColor(title: string): string | null {
  return title.match(COLOR_PATTERN)?.[0] ?? null;
}

function stripColor(title: string): string {
  if (!COLOR_PATTERN.test(title)) return title.trim();
  return title.replace(new RegExp(`\\b(?:${COLOR_NAMES.map((name) => name.replace(/ /g, "\\s+")).join("|")})\\b`, "gi"), " ")
    .replace(/\b(?:edition|edici[oó]n)\b/gi, " ")
    .replace(/\bcolor\b/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function modelFromTitle(product: PublicProduct): string {
  const raw = product.modelo?.trim() && product.modelo.trim().toLocaleLowerCase("es") !== product.nombre.trim().toLocaleLowerCase("es")
    ? product.modelo.trim()
    : product.nombre.trim();
  const withoutBrand = (product.marca.trim() ? raw.replace(brandPattern(product.marca), " ") : raw).replace(/\s+/g, " ").trim();
  const withoutPrestigeLabel = /^prestige$/i.test(product.marca.trim())
    ? withoutBrand.replace(/^medias\s+/i, "")
    : withoutBrand;
  const withoutPrefix = withoutPrestigeLabel.replace(CATALOG_PREFIX, "").trim();
  const firstSegment = withoutPrefix.split(/\s+[-–—]\s+|[.;]/)[0].trim();
  const description = firstSegment.match(DESCRIPTION_START);
  const model = description && description.index && description.index > 0
    ? firstSegment.slice(0, description.index).trim()
    : firstSegment;
  return model.replace(/\s+teclas?$/i, "").trim() || withoutPrefix;
}

export function publicProductParts(product: PublicProduct, context: NameContext = {}) {
  const brand = titleCase(product.marca.trim() || "");
  const publicBrand = /^prestige$/i.test(product.marca.trim()) ? "Prestige Medias" : brand;
  const rawModel = modelFromTitle(product);
  const color = findColor(rawModel) ?? findColor(product.nombre);
  const needsColor = Boolean(color && (context.productChosenByCm || /\b(?:color|colores|tono|variante|edici[oó]n)\b/i.test(context.sourceText ?? "") || COLOR_PATTERN.test(context.sourceText ?? "")));
  const withoutColor = stripColor(rawModel).replace(/\s+/g, " ").trim();
  const model = titleCase(`${withoutColor || rawModel}${needsColor && color ? ` ${color}` : ""}`.trim());
  return { brand: publicBrand, model, fullName: `${publicBrand} ${model}`.trim() };
}

export function formatPublicProductName(product: PublicProduct, context: NameContext = {}): string {
  return publicProductParts(product, context).fullName;
}

/** Rewrite only catalogue-backed product mentions; leave the rest of the operator's prose alone. */
export function normalizeGeneratedProductMentions(text: string, products: PublicProduct[], context: NameContext = {}): string {
  const aliases = new Map<string, string>();
  for (const product of products) {
    const { fullName } = publicProductParts(product, context);
    const rawModel = modelFromTitle(product);
    const rawWithoutEdition = rawModel.replace(/\s+\b(?:edition|edici[oó]n)\b/gi, "").trim();
    const options = [fullName, product.nombre, `${product.marca} ${product.nombre}`, `${product.marca} ${rawModel}`, `${product.marca} ${rawWithoutEdition}`, `${product.marca} ${stripColor(rawModel)}`];
    const distinctiveSingleWord = /^[\p{L}][\p{L}\d-]{6,}$/u.test(rawModel);
    if (/\d/.test(rawModel) || rawModel.trim().split(/\s+/).length > 1 || distinctiveSingleWord) {
      options.push(rawModel, rawWithoutEdition, stripColor(rawModel));
    }
    for (const option of options) {
      const alias = option.replace(/\s+/g, " ").trim();
      if (alias.length >= 4 && !aliases.has(alias.toLocaleLowerCase("es"))) aliases.set(alias.toLocaleLowerCase("es"), fullName);
    }
  }
  if (aliases.size === 0) return text;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...aliases.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})(?:\\s+${PUBLIC_DESCRIPTION_SUFFIX})?(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(pattern, (match, alias: string) => aliases.get(alias.toLocaleLowerCase("es")) ?? match);
}

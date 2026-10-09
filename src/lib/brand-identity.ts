/** Match whole brand names, including spacing/hyphen variants, never substrings. */
export function brandMentionPattern(name: string): RegExp {
  const parts = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
    .split(/[\s-]+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = /^midi[\s-]*plus$/i.test(name) ? "midi[\\s-]*plus" : parts.join("[\\s-]+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu");
}

export function mentionsBrand(text: string, name: string): boolean {
  return !!name.trim() && brandMentionPattern(name).test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

// These names come from the PC MIDI store catalogue, not from model inference.
export const STORE_BRANDS = ["Arturia", "MidiPlus", "Kressmer", "Audio Technica", "Alctron", "Synido", "Meike", "M-Vave"];

export function resolveCatalogBrand(name: string, rawBrand?: string): string | null {
  const named = STORE_BRANDS.filter((brand) => mentionsBrand(name, brand));
  // An explicit manufacturer in the product title beats a generic store label.
  if (named.length === 1) return named[0];
  if (named.length > 1) return null;
  return rawBrand?.trim() || null;
}

export function mentionedBrandId(text: string, brands: { id: string; name: string }[]): string | null {
  const matches = [...new Map(brands.filter((brand) => mentionsBrand(text, brand.name)).map((brand) => [brand.id, brand])).values()];
  return matches.length === 1 ? matches[0].id : null;
}

export function validateClassifiedEntities(
  text: string,
  proposedProductId: string | null,
  brands: { id: string; name: string }[],
  products: { id: string; name: string; brandId: string }[],
) {
  const explicitBrandId = mentionedBrandId(text, brands);
  const proposed = products.find((product) => product.id === proposedProductId);
  const normalized = text.toLowerCase().replace(/[\s-]+/g, "");
  const codes = proposed?.name.match(/\b[a-z]{1,8}[- ]?\d{1,5}[a-z]*\b/gi) ?? [];
  const mentionedModel = proposed && (text.toLowerCase().includes(proposed.name.toLowerCase())
    || codes.some((code) => {
      const compact = code.toLowerCase().replace(/[\s-]+/g, "");
      return new RegExp(`(?<![a-z0-9])${compact}(?![a-z0-9])`, "i").test(text.replace(/([a-z])[- ]+(?=\d)/gi, "$1"))
        || normalized === compact;
    }));
  const product = mentionedModel && (!explicitBrandId || proposed.brandId === explicitBrandId) ? proposed : null;
  return { matchedBrandId: product?.brandId ?? explicitBrandId, matchedProductId: product?.id ?? null };
}

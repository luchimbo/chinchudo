import { describe, expect, it } from "vitest";
import { mentionsBrand, resolveCatalogBrand, validateClassifiedEntities } from "../brand-identity";
import { loadClientContext } from "../client-context";
import { normalizeGeneratedProductMentions, validateGeneratedProductBrands, formatPublicProductName } from "../product-public-name";

const brands = [{ id: "midi", name: "MidiPlus", clientId: "pcmidi" }, { id: "meike", name: "Meike", clientId: "pcmidi" }];
const products = [
  { id: "m25", name: "Controlador MIDI Meike M25 25 Teclas Sensitivo USB", brandId: "meike", brand: brands[1] },
  { id: "ak490", name: "MIDIPLUS AK490", brandId: "midi", brand: brands[0] },
];
const publicProducts = products.map((product) => ({ nombre: product.name, marca: product.brand.name }));

describe("identidad de marca y modelo", () => {
  it("resuelve el fabricante del título sin inventar MidiPlus para productos sin marca", () => {
    expect(resolveCatalogBrand("Piano digital MEIKE MK-8861", "PC MIDI CENTER")).toBe("Meike");
    expect(resolveCatalogBrand("Teclado musical sin fabricante")).toBeNull();
    expect(resolveCatalogBrand("Arturia y Meike comparativa", "MidiPlus")).toBeNull();
    expect(mentionsBrand("Midi Plus AK490", "MidiPlus")).toBe(true);
    expect(mentionsBrand("Meikeland teclado", "Meike")).toBe(false);
  });

  it("rechaza una marca de IA equivocada y un modelo propuesto por categoría", () => {
    expect(validateClassifiedEntities("Teclado Meike M25", "ak490", brands, products))
      .toEqual({ matchedBrandId: "meike", matchedProductId: null });
    expect(validateClassifiedEntities("Meike M25", "m25", brands, products))
      .toEqual({ matchedBrandId: "meike", matchedProductId: "m25" });
    expect(validateClassifiedEntities("Cómo conectar un controlador MIDI", "ak490", brands, products))
      .toEqual({ matchedBrandId: null, matchedProductId: null });
    expect(validateClassifiedEntities("AK4900", "ak490", brands, products).matchedProductId).toBeNull();
  });

  it("valida la pareja marca/modelo aunque el código exista en el catálogo", () => {
    expect(validateGeneratedProductBrands("El MidiPlus M25 tiene 25 teclas.", publicProducts)).toContain("product_brand_mismatch");
    expect(validateGeneratedProductBrands("El MidiPlus Meike M25 tiene 25 teclas.", publicProducts)).toContain("product_brand_mismatch");
    expect(validateGeneratedProductBrands("El Meike M25 y el MidiPlus AK490 son alternativas.", publicProducts)).toEqual([]);
    expect(validateGeneratedProductBrands("El Midi Plus MK-137 sirve.", [{ marca: "Meike", nombre: "Teclado Meike MK137 Verde 37 Teclas Sensitivas Controlador MIDI" }])).toContain("product_brand_mismatch");
  });

  it("no agrega una marca al modelo que ya está atribuido a otra", () => {
    expect(normalizeGeneratedProductMentions("MidiPlus M25", publicProducts)).toBe("MidiPlus M25");
    expect(normalizeGeneratedProductMentions("M25", publicProducts)).toBe("Meike M25");
    expect(formatPublicProductName({ marca: "Meike", nombre: "Teclado Meike MK137 Verde 37 Teclas Sensitivas Controlador MIDI" })).toBe("Meike Mk137");
  });

  it("no atribuye un modelo compartido a la primera marca de la lista", () => {
    expect(normalizeGeneratedProductMentions("M25", [...publicProducts, { marca: "Otra", nombre: "M25" }])).toBe("M25");
  });

  const database = (detectedProductId: string | null = null) => ({
    client: { findUniqueOrThrow: async () => ({ id: "pcmidi", slug: "pcmidi" }) },
    persona: { findMany: async () => [] }, catalogRule: { findMany: async () => [] },
    brand: { findUnique: async () => brands[0], findFirst: async () => brands[0] },
    product: { findUnique: async () => products.find((product) => product.id === detectedProductId), findMany: async () => products },
    service: { findMany: async () => [] },
  }) as any;

  it("el producto Meike determina el contexto aunque la oportunidad diga MidiPlus", async () => {
    const result = await loadClientContext(database("m25"), "pcmidi", { sourceText: "Consulta sobre este teclado", detectedBrandId: "midi", detectedProductId: "m25" });
    expect(result.brand.id).toBe("meike");
    expect(result.detectedProduct?.id).toBe("m25");
    expect(result.detectedBrandId).toBe("meike");
  });

  it("el título Meike manda sobre el respaldo y una consulta genérica queda sin marca detectada", async () => {
    const result = await loadClientContext(database(), "pcmidi", { sourceTitle: "Review Meike MK137", sourceText: "Sirve para aprender?", detectedBrandId: "midi", detectedProductId: null });
    expect(result.brand.id).toBe("meike");
    const generic = await loadClientContext(database(), "pcmidi", { sourceText: "Consulta sobre teclado", detectedBrandId: "midi", detectedProductId: null });
    expect(generic.detectedBrandId).toBeNull();
  });
});

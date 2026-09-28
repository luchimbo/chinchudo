import { describe, expect, it } from "vitest";
import { formatPublicProductName, normalizeGeneratedProductMentions } from "../product-public-name";

describe("nombres públicos de productos", () => {
  it("separa marca y modelo del título comercial sin repetir la marca", () => {
    expect(formatPublicProductName({ marca: "ARTURIA", nombre: "ARTURIA MiniLab 3 Controlador MIDI 25 Teclas" }))
      .toBe("Arturia Minilab 3");
    expect(formatPublicProductName({ marca: "Arturia", nombre: "Arturia Arturia MiniLab 3 Controlador MIDI" }))
      .toBe("Arturia Minilab 3");
    expect(formatPublicProductName({ marca: "MIDIPLUS", nombre: "MIDIPLUS AK490 Teclado Controlador MIDI USB 4 Octavas" }))
      .toBe("Midiplus Ak490");
    expect(formatPublicProductName({ marca: "Arturia", nombre: "Placa de sonido Arturia MiniFuse 2 Black" }))
      .toBe("Arturia Minifuse 2");
    expect(formatPublicProductName({ marca: "MIDIPLUS", nombre: "Placa de sonido profesional USB MIDIPLUS Studio M 24 bits 192kHz" }))
      .toBe("Midiplus Studio M");
    expect(formatPublicProductName({ marca: "Kressmer", nombre: "Kressmer LM-281 Piano Digital 88 Teclas con Mueble" }))
      .toBe("Kressmer Lm-281");
    expect(formatPublicProductName({ marca: "Arturia", nombre: "Sintetizador ARTURIA AstroLab 88 Teclas" }))
      .toBe("Arturia Astrolab 88");
  });

  it("usa el modelo separado cuando el catálogo lo trae y conserva términos ambiguos sin inventar", () => {
    expect(formatPublicProductName({ marca: "Arturia", nombre: "Arturia KeyStep Pro Controlador MIDI", modelo: "KeyStep Pro" }))
      .toBe("Arturia Keystep Pro");
    expect(formatPublicProductName({ marca: "Kressmer", nombre: "Kressmer Aurora Special" }))
      .toBe("Kressmer Aurora Special");
    expect(formatPublicProductName({ marca: "Kressmer", nombre: "Kressmer Aurora Special Edition" }))
      .toBe("Kressmer Aurora Special Edition");
    expect(formatPublicProductName({ marca: "Arturia", nombre: "Arturia" })).toBe("Arturia");
  });

  it("omite colores salvo que la consulta o selección de variante los requiera", () => {
    const product = { marca: "Arturia", nombre: "Arturia MiniLab 3 Rose Quartz Controlador MIDI 25 Teclas" };
    expect(formatPublicProductName(product)).toBe("Arturia Minilab 3");
    expect(formatPublicProductName(product, { sourceText: "¿Está disponible en Rose Quartz?" }))
      .toBe("Arturia Minilab 3 Rose Quartz");
    expect(formatPublicProductName(product, { productChosenByCm: true }))
      .toBe("Arturia Minilab 3 Rose Quartz");
    expect(formatPublicProductName({ marca: "Kressmer", nombre: "Kressmer LM-103 Color Marron" }))
      .toBe("Kressmer Lm-103");
  });

  it("recorta los títulos de Prestige al modelo sin pack ni artículo", () => {
    expect(formatPublicProductName({ marca: "Prestige", nombre: "Pack x3 Tech Basic con refuerzo Art 2555" }))
      .toBe("Prestige Medias Tech Basic");
    expect(formatPublicProductName({ marca: "Prestige", nombre: "Prestige Medias Tech Basic con refuerzo" }))
      .toBe("Prestige Medias Tech Basic");
  });

  it("reescribe solo menciones de catálogo en texto generado", () => {
    const product = { marca: "Arturia", nombre: "Arturia MiniLab 3 Black Edition Controlador MIDI 25 Teclas" };
    const result = normalizeGeneratedProductMentions("El Arturia MiniLab 3 Black Edition Controlador MIDI 25 Teclas sirve para tu DAW. MIDI queda en mayúsculas.", [product]);
    expect(result).toBe("El Arturia Minilab 3 sirve para tu DAW. MIDI queda en mayúsculas.");
    expect(normalizeGeneratedProductMentions("Las Prestige Medias Tech Basic sirven para entrenar.", [{ marca: "Prestige", nombre: "Pack x3 Tech Basic con refuerzo Art 2555" }]))
      .toBe("Las Prestige Medias Tech Basic sirven para entrenar.");
    expect(normalizeGeneratedProductMentions("El Arturia MiniLab 3 Black suma controles.", [product]))
      .toBe("El Arturia Minilab 3 suma controles.");
    expect(normalizeGeneratedProductMentions("El Arturia MiniLab 3 controlador MIDI 25 teclas suma controles.", [product]))
      .toBe("El Arturia Minilab 3 suma controles.");
    expect(normalizeGeneratedProductMentions("BeatStep permite secuenciar.", [{ marca: "Arturia", nombre: "BEATSTEP CONTROLADOR MIDI SEQUENCER" }]))
      .toBe("Arturia Beatstep permite secuenciar.");
  });
});

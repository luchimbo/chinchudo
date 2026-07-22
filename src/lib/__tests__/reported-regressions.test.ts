import { describe, expect, it } from "vitest";
import { selectRelevantProducts, type ScopedProduct } from "../catalog";
import { sanitizePublicDraft, validatePublicDraft } from "../draft-output";

function product(id: string, name: string, category: string, description: string): ScopedProduct {
  return {
    id, name, category, description, technicalSpecs: "", useCases: description,
    warrantyNotes: "", stockStatus: "Disponible", priceRange: "", brandId: `b-${id}`,
    createdAt: new Date(), updatedAt: new Date(),
    brand: { id: `b-${id}`, clientId: "pcmidi", name: name.split(" ")[0], strengths: "", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: new Date(), updatedAt: new Date() },
  };
}

const catalog = [
  product("keystep", "Arturia KeyStep Pro", "Controladores MIDI", "37 teclas y secuenciador para hardware"),
  product("keylab", "Arturia KeyLab 88 MK3", "Controladores MIDI", "88 teclas contrapesadas, 12 pads RGB y controles DAW"),
  product("c16", "Synido TempoPAD C-16", "Controladores MIDI", "controlador basado en 16 pads para beats y samples"),
  product("synth", "Arturia MiniFreak", "Sintetizadores", "sintetizador hibrido con motor de sonido propio"),
];

describe("regresiones de reportes de julio", () => {
  it("elige un controlador basado en pads y nunca KeyStep Pro", () => {
    const selected = selectRelevantProducts("Busco el mejor controlador MIDI basado en pads, sin teclado", null, 3, { catalogProducts: catalog, scoped: true });
    expect(selected[0]?.modelo).toContain("TempoPAD");
    expect(selected.map((item) => item.modelo)).not.toContain("Arturia KeyStep Pro");
  });

  it("prioriza una alternativa equivalente de 88 teclas", () => {
    const selected = selectRelevantProducts("Alternativa al Roland A-88 MKII, necesito 88 teclas para piano", null, 2, { catalogProducts: catalog, scoped: true });
    expect(selected[0]?.modelo).toContain("KeyLab 88 MK3");
  });

  it("no presenta un controlador como sustituto de un sintetizador", () => {
    const selected = selectRelevantProducts("Review: cual deberia ser mi primer sintetizador synth", null, 3, { catalogProducts: catalog, scoped: true });
    expect(selected[0]?.modelo).toContain("MiniFreak");
    expect(selected.map((item) => item.modelo)).not.toContain("Arturia KeyStep Pro");
  });

  it("no recomienda por orden alfabetico cuando no hay señal", () => {
    expect(selectRelevantProducts("Me gusta mucho esta cancion", null, 3, { catalogProducts: catalog, scoped: true })).toEqual([]);
  });

  it("elimina instrucciones internas y modismos reportados", () => {
    const clean = sanitizePublicDraft("Conviene compararlo antes de cerrar. Usa frases naturales y especificas, sin modular demasiado. Cierre simple y util.");
    expect(clean).toContain("antes de elegir");
    expect(clean).not.toMatch(/usa frases|cierre simple/i);
    expect(validatePublicDraft(clean)).toEqual([]);
  });

  it("rechaza tags y recomendaciones MidiPlus sin modelo", () => {
    expect(validatePublicDraft("Te recomiendo el controlador MidiPlus #homeStudio")).toEqual(expect.arrayContaining(["blocked_language", "generic_midiplus_product"]));
  });
});

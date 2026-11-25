import { describe, expect, it } from "vitest";
import { selectRelevantProducts, type ScopedProduct } from "../catalog";
import { sanitizeCopilotDraft, sanitizePublicDraft, validatePublicDraft } from "../draft-output";

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

  describe("elige según lo que pide el comentario", () => {
    const store = [
      product("organ", "Kit MP809 Combo Organo Teclado Musical Con Banqueta Soporte Funda y Auriculares", "Organos y Pianos", "Teclado para aprender"),
      product("ed6", "MIDIPLUS Batería Electrónica ED6", "baterias-electronicas", "Batería electrónica compacta"),
      product("minifuse", "Arturia MiniFuse 2 Placa de Sonido", "Interfaces", "Interfaz de audio USB"),
      product("bm800", "Midiplus Micrófono Condenser BM800", "microfonos", "Micrófono para voces"),
      product("bulk", "Pack x5 Unidades Arturia MiniLab 3", "Controladores MIDI", "Controlador MIDI"),
      product("arm", "Alctron Brazo Articulado para Micrófono de Mesa MA614", "Micrófonos", "Brazo para micrófono"),
    ];
    const pick = (title: string, comment: string) => selectRelevantProducts(`${title} ${comment}`, null, 3, { catalogProducts: store, scoped: true, commentText: comment })[0]?.id;

    it("la pregunta del comentario manda sobre el tema del video", () => {
      expect(pick("Cómo grabar batería electrónica", "En todos los casos necesito la interfaz?")).toBe("minifuse");
    });

    it("usa el título cuando el comentario no pide nada concreto", () => {
      expect(pick("La mejor batería electrónica barata", "Muy buen video")).toBe("ed6");
    });

    it("no confunde condensador con la palabra con ni propone accesorios", () => {
      expect(pick("Review", "Busco un micrófono condensador barato")).toBe("bm800");
    });

    it("no recomienda packs mayoristas", () => {
      const selected = selectRelevantProducts("Busco un controlador MIDI", null, 5, { catalogProducts: store, scoped: true });
      expect(selected.map((item) => item.id)).not.toContain("bulk");
    });
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

  it("neutraliza promesas comerciales no verificadas", () => {
    const clean = sanitizePublicDraft("El MiniLab 3 tiene faders. En PC MIDI Center lo tenés a un muy buen precio con cuotas sin interés.");
    expect(clean).toBe("El MiniLab 3 tiene faders.");
    expect(validatePublicDraft(clean)).toEqual([]);
  });

  it("no corta una oración que nombra el local en el medio", () => {
    const text = "Buen video para orientarse. El Arturia Keystep Mk2 tiene secuenciador y arpegiador, y lo tenés en PC MIDI Center.";
    expect(sanitizeCopilotDraft(text, "pcmidi")).toBe(text);
    expect(validatePublicDraft(sanitizeCopilotDraft(text, "pcmidi"))).toEqual([]);
  });

  it("rechaza una propuesta que termina a mitad de oración", () => {
    expect(validatePublicDraft("El Arturia Keystep Mk2 tiene secuenciador y arpegiador, y lo tenés")).toContain("unfinished_sentence");
    expect(validatePublicDraft("Para practicar de noche va muy bien 🎧")).toEqual([]);
    expect(validatePublicDraft("Te dejo la guía: https://jurispedia.com.ar/laboral?utm_term=laboral")).toEqual([]);
  });

  it("quita la apertura y el cierre enlatados del copiloto", () => {
    expect(sanitizeCopilotDraft("Mirá, el MiniLab 3 tiene faders. Consultá en PC MIDI Center por stock, precio, garantía y financiación.", "pcmidi"))
      .toBe("El MiniLab 3 tiene faders.");
  });
});

import { describe, expect, it } from "vitest";
import type { OpportunityIntent } from "@prisma/client";
import { suggestPersona, PERSONA_NAMES, PERSONA_NAME_SET } from "../persona-router";

// Helper para armar una oportunidad mínima como la espera suggestPersona.
function opp(sourceText: string, detectedIntent: OpportunityIntent = "GENERAL_DISCUSSION") {
  return { sourceText, detectedIntent, detectedProduct: null };
}

describe("suggestPersona — un caso representativo por persona del quinteto", () => {
  it("precio/cuotas → Cazador de Ofertas", () => {
    const s = suggestPersona(opp("¿Hacen cuotas sin interés? ¿Cuánto sale?"));
    expect(s.personaName).toBe(PERSONA_NAMES.CAZADOR);
  });

  it("DAW/MIDI → Técnico / Productor", () => {
    const s = suggestPersona(opp("¿Anda con Ableton para producción en home studio?", "TECHNICAL_QUESTION"));
    expect(s.personaName).toBe(PERSONA_NAMES.TECNICO);
  });

  it("garantía → Técnico / Productor", () => {
    const s = suggestPersona(opp("¿Tiene garantía oficial?", "WARRANTY_QUESTION"));
    expect(s.personaName).toBe(PERSONA_NAMES.TECNICO);
  });

  it("ruido/depto → Baterista de Departamento", () => {
    const s = suggestPersona(opp("Quiero una batería electrónica pero me molesta el ruido para los vecinos del departamento"));
    expect(s.personaName).toBe(PERSONA_NAMES.BATERISTA);
  });

  it("lanzamiento/Kressmer → Trend-Setter Kressmer", () => {
    const s = suggestPersona(opp("Vi la nueva Kressmer, ¡qué diseño!"));
    expect(s.personaName).toBe(PERSONA_NAMES.TRENDSETTER);
  });

  it("alumnos/clases → Profe / Madre-Padre", () => {
    const s = suggestPersona(opp("Soy profe y busco algo simple para mis alumnos principiantes"));
    expect(s.personaName).toBe(PERSONA_NAMES.PROFE);
  });

  it("sin señales → default Técnico / Productor", () => {
    const s = suggestPersona(opp("Hola, buenas"));
    expect(s.personaName).toBe(PERSONA_NAMES.TECNICO);
  });
});

describe("guard rail: el router nunca sugiere una persona fuera del set canónico", () => {
  const inputs = [
    "",
    "Hola",
    "cuotas precio oferta",
    "ableton midi daw garantía",
    "batería ruido vecinos departamento",
    "kressmer diseño novedad lanzamiento",
    "profe alumnos clase principiante durabilidad",
    "texto random sin sentido 12345",
  ];

  it.each(inputs)("entrada %j → nombre en PERSONA_NAME_SET", (text) => {
    const s = suggestPersona(opp(text));
    expect(PERSONA_NAME_SET.has(s.personaName)).toBe(true);
  });
});

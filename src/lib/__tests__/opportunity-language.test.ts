import { describe, expect, it } from "vitest";
import { detectOpportunityLanguage, opportunityLanguage } from "../opportunity-language";

describe("detectOpportunityLanguage", () => {
  it.each([
    ["¿Qué controlador MIDI me recomiendan para empezar a producir en casa?", "es"],
    ["Hola, alguien sabe si este teclado tiene salida de auriculares?", "es"],
    ["Which MIDI keyboard should I buy for a small home studio?", "en"],
    ["Does this work with FL Studio on Windows?", "en"],
    ["Qual teclado vocês recomendam para quem está começando? Não sei qual comprar", "pt"],
    ["Welches Digitalpiano würdet ihr für Anfänger empfehlen? Ich möchte nicht zu viel ausgeben", "de"],
    ["viene con cable de corriente?", "es"],
    ["Solo sirve para esos DAWs? No me vale para reaper o waveform?", "es"],
    ["Media maratón", "es"],
    ["Piano Digital Roland F701 - projetado para casas e ambientes...", "pt"],
    ["🔥🔥🔥", "other"],
    ["Привет, какой синтезатор лучше купить?", "other"],
  ])("%s → %s", (text, expected) => {
    expect(detectOpportunityLanguage(text)).toBe(expected);
  });
});

describe("opportunityLanguage", () => {
  it("accepts only known codes", () => {
    expect(opportunityLanguage("pt")).toBe("pt");
    expect(opportunityLanguage("fr")).toBe("");
    expect(opportunityLanguage(undefined)).toBe("");
  });
});

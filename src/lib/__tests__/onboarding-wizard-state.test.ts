import { describe, expect, it } from "vitest";
import { sanitizeDraft } from "@/lib/onboarding";
import { initialStepFor, reanalysisImpact, stepLabelsFor } from "@/lib/onboarding-wizard-state";

describe("initialStepFor", () => {
  it("en modo edit ignora el currentStep congelado y arranca en Revisar (1)", () => {
    expect(initialStepFor({ mode: "edit", currentStep: 3 })).toBe(1);
  });

  it("en modo setup respeta el currentStep persistido", () => {
    expect(initialStepFor({ mode: "setup", currentStep: 2 })).toBe(1);
  });

  it("en modo setup nunca baja de 0 ni pasa de 2", () => {
    expect(initialStepFor({ mode: "setup", currentStep: 0 })).toBe(0);
    expect(initialStepFor({ mode: "setup", currentStep: 99 })).toBe(2);
  });

  it("un ?step= válido gana sobre el modo", () => {
    expect(initialStepFor({ mode: "edit", currentStep: 3, stepParam: "0" })).toBe(0);
    expect(initialStepFor({ mode: "setup", currentStep: 1, stepParam: "2" })).toBe(2);
  });

  it("un ?step= inválido o fuera de rango se ignora", () => {
    expect(initialStepFor({ mode: "edit", currentStep: 3, stepParam: "9" })).toBe(1);
    expect(initialStepFor({ mode: "edit", currentStep: 3, stepParam: "abc" })).toBe(1);
    expect(initialStepFor({ mode: "edit", currentStep: 3, stepParam: null })).toBe(1);
  });
});

describe("stepLabelsFor", () => {
  it("setup usa Analizar/Revisar/Activar", () => {
    expect(stepLabelsFor("setup").map((s) => s[1])).toEqual(["Analizar", "Revisar", "Activar"]);
  });
  it("edit usa Sitio/Revisar/Guardar", () => {
    expect(stepLabelsFor("edit").map((s) => s[1])).toEqual(["Sitio", "Revisar", "Guardar"]);
  });
});

describe("reanalysisImpact", () => {
  it("lista las labels humanas de los campos protegidos por manualFields", () => {
    const draft = sanitizeDraft({ name: "Cliente", manualFields: ["tone", "offer"] });
    const impact = reanalysisImpact(draft);
    expect(impact.keepLabels).toEqual(["Oferta principal", "Tono"]);
  });

  it("ignora entradas offering: en la lista de labels", () => {
    const draft = sanitizeDraft({ name: "Cliente", manualFields: ["tone", "offering:manual-1"] });
    const impact = reanalysisImpact(draft);
    expect(impact.keepLabels).toEqual(["Tono"]);
  });

  it("cuenta las ofertas manuales", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      offerings: [
        { id: "m1", kind: "product", name: "A", selected: true, evidence: { url: "x", status: "manual", confidence: "high" } },
        { id: "m2", kind: "product", name: "B", selected: true, evidence: { url: "x", status: "extracted", confidence: "high" } },
      ] as any,
    });
    expect(reanalysisImpact(draft).manualOfferingsCount).toBe(1);
  });
});

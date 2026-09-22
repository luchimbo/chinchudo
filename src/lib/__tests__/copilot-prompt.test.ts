import { describe, expect, it } from "vitest";
import { buildCopilotPrompt, buildPrompt, COPILOT_MAX_CHARACTERS, shortenCopilotText } from "../ai-draft-generator";

const now = new Date();

function context(editorialGuidance?: string) {
  const brand = { id: "brand", clientId: "client", name: "MidiPlus", strengths: "soporte", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: now, updatedAt: now } as any;
  return {
    client: { id: "client", name: "PC MIDI Center", slug: "pcmidi", description: "", domainKeywords: "[]", domainExclusions: "[]", dailyOpportunityTarget: 0, dailyDraftTarget: 0, responsePolicy: {}, opportunitySearchState: {}, autoPublish: false, autoApprove: false, active: true, openrouterApiKey: "", openrouterModel: "", storeUrl: "", blogBaseUrl: "", labName: "", logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "", fromName: "", fromEmail: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", unsubscribeBaseUrl: "", trackBaseUrl: "", geoBrandPatterns: [], createdAt: now, updatedAt: now } as any,
    brand,
    persona: { id: "persona", clientId: "client", name: "Comercial", role: "", tone: "", goals: "", preferredLength: "", allowedPhrases: "", forbiddenPhrases: "", goodExamples: "", badExamples: "", angle: "", avatarUrl: "", voiceId: "", createdAt: now, updatedAt: now } as any,
    opportunity: { id: "opportunity", sourceText: "Busco un controlador MIDI para casa", detectedIntent: "PURCHASE_QUESTION", detectedProduct: null, channel: { id: "channel", name: "Instagram", type: "", baseUrl: "", responseStyleNotes: "" }, detectedBrand: brand } as any,
    catalogProducts: [], catalogRules: [], knowledge: [], objections: [], editorialGuidance,
  } as any;
}

describe("direccion editorial del Copiloto", () => {
  it("incluye la guia opcional de tono y coyuntura en el prompt", () => {
    const prompt = buildPrompt(context("Estilo: con onda. No fuerces memes.\nPulso opcional: tema actual."));
    expect(prompt).toContain("Direccion editorial elegida por el community manager");
    expect(prompt).toContain("No fuerces memes.");
    expect(prompt).toContain("Pulso opcional: tema actual.");
  });

  it("no agrega el bloque editorial al flujo clasico", () => {
    expect(buildPrompt(context())).not.toContain("Direccion editorial elegida por el community manager");
  });

  it("pide una unica propuesta breve para el Copiloto", () => {
    const prompt = buildCopilotPrompt(context());
    expect(prompt).toContain("UNA sola propuesta breve");
    expect(prompt).toContain(`Máximo ${COPILOT_MAX_CHARACTERS} caracteres`);
    expect(prompt).toContain('"text"');
    expect(prompt).not.toContain('"variants"');
  });

  it("usa la ficha del producto elegido por el CM y obliga a nombrarlo", () => {
    const base = context();
    const product = {
      id: "minilab", brandId: "brand", name: "MiniLab 3", category: "controladores-midi",
      description: "Controlador compacto de 25 teclas con 8 pads sensibles a la velocidad.",
      useCases: "Producción en home studio", technicalSpecs: "25 teclas, 8 pads", warrantyNotes: "Garantía oficial y soporte técnico local.",
      stockStatus: "", priceRange: "", createdAt: now, updatedAt: now, brand: base.brand,
    };
    const prompt = buildCopilotPrompt({
      ...base,
      opportunity: { ...base.opportunity, detectedProduct: product },
      catalogProducts: [product],
      productChosenByCm: true,
    });
    expect(prompt).toContain("Producto elegido por el community manager: MidiPlus MiniLab 3");
    expect(prompt).toContain("8 pads sensibles a la velocidad");
    expect(prompt).toContain("Tipo de producto: controladores midi");
    expect(prompt).toContain("Garantía oficial y soporte técnico local.");
    expect(prompt).toContain("Nombrá el modelo completo una sola vez: MidiPlus MiniLab 3.");

    const detected = buildPrompt({ ...base, opportunity: { ...base.opportunity, detectedProduct: product }, catalogProducts: [product] });
    expect(detected).toContain("Características de MidiPlus MiniLab 3");
    expect(detected).not.toContain("Producto elegido por el community manager");
  });

  it("recorta el fallback por palabra y respeta el limite", () => {
    const source = `${"Una respuesta concreta para el comentario ".repeat(20)}final.`;
    const shortened = shortenCopilotText(source);
    expect(shortened.length).toBeLessThanOrEqual(COPILOT_MAX_CHARACTERS);
    expect(shortened).toMatch(/…$/);
    expect(shortenCopilotText("Texto corto.")).toBe("Texto corto.");
  });
});

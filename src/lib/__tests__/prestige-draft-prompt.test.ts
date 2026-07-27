import { describe, expect, it } from "vitest";
import { buildPrompt } from "../ai-draft-generator";
import { validateDraftForClient } from "../draft-output";

const now = new Date();
const prestigeClient = {
  id: "prestige", name: "PRESTIGE MEDIAS", slug: "prestige-running", description: "",
  domainKeywords: "", domainExclusions: JSON.stringify(["medias medicinales"]), dailyOpportunityTarget: 50,
  dailyDraftTarget: 50, responsePolicy: {}, opportunitySearchState: {}, autoPublish: false, autoApprove: false,
  active: true, openrouterApiKey: "", openrouterModel: "", storeUrl: "", blogBaseUrl: "", labName: "",
  logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "", fromName: "",
  fromEmail: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", unsubscribeBaseUrl: "",
  trackBaseUrl: "", geoBrandPatterns: [], createdAt: now, updatedAt: now,
} as any;

function context(channelName = "Instagram", sourceText = "Se me hacen ampollas en los fondos largos") {
  const brand = { id: "b1", clientId: "prestige", name: "Prestige", strengths: "comodidad", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: now, updatedAt: now } as any;
  return {
    client: prestigeClient,
    brand,
    persona: { id: "p1", clientId: "prestige", name: "Práctico", role: "", tone: "cercano", goals: "ayudar", preferredLength: "", allowedPhrases: "", forbiddenPhrases: "", goodExamples: "", badExamples: "", angle: "", avatarUrl: "", voiceId: "", createdAt: now, updatedAt: now },
    opportunity: { id: "o1", sourceText, detectedIntent: "GENERAL_DISCUSSION", detectedProduct: null, channel: { id: "c1", name: channelName, type: "", baseUrl: "", responseStyleNotes: "" }, detectedBrand: brand },
    catalogProducts: [], catalogRules: [], knowledge: [], objections: [],
  } as any;
}

describe("prompt de Prestige", () => {
  it("ancla la identidad de usuario real y no filtra reglas de PC MIDI", () => {
    const prompt = buildPrompt(context());
    expect(prompt).toContain("usuario real de Prestige Medias");
    expect(prompt).toContain("Instagram/TikTok: usá frases cortas");
    expect(prompt).not.toMatch(/MIDI|Millenium|Ableton|PC MIDI/);
    expect(prompt).not.toMatch(/yo vi estas|usuario 100% independiente/i);
  });

  it("no fuerza un producto si no existe compatibilidad suficiente", () => {
    const prompt = buildPrompt(context());
    expect(prompt).toContain("no fuerces una recomendación ni inventes un modelo");
    expect(prompt).toContain("sin mencionar ni inventar un producto");
  });

  it("adapta el estilo explicativo para YouTube", () => {
    expect(buildPrompt(context("YouTube"))).toContain("YouTube/Facebook/Reddit: mantené cercanía");
  });

  it("permite experiencias reales, pero bloquea claims médicos y preguntas de recolección", () => {
    expect(validateDraftForClient("Yo uso medias Prestige para correr y me resultan cómodas.", "prestige-running")).toEqual([]);
    expect(validateDraftForClient("Correr mejora la resistencia.", "prestige-running")).toContain("prestige_missing_brand_mention");
    expect(validateDraftForClient("Yo uso estas y me curaron el dolor.", "prestige-running")).toContain("prestige_medical_claim");
    expect(validateDraftForClient("¿Qué talle usás para correr?", "prestige-running")).toContain("prestige_data_question");
    expect(validateDraftForClient("¿A quién no le pasó terminar con roce?", "prestige-running")).toContain("prestige_missing_brand_mention");
    expect(validateDraftForClient("El Pack x3 Tech Basic va muy bien.", "prestige-running")).toContain("prestige_pack_as_model");
  });

  it("presenta Tech Basic como modelo y exige la marca Prestige Medias", () => {
    const prompt = buildPrompt({
      ...context(),
      catalogProducts: [{
        id: "tech-basic", name: "Pack x 3 Tech Basic - soquetes cortos con refuerzo", category: "Tripack",
        description: "Soquetes cortos Tech Basic con refuerzo.", useCases: "Running", technicalSpecs: "",
        brand: { name: "Prestige" },
      }],
    } as any);
    expect(prompt).toContain("Prestige Medias Tech Basic");
    expect(prompt).toContain("nombrá 'Prestige Medias' una sola vez");
  });
});

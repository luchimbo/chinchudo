import { describe, expect, it } from "vitest";
import { catalogRuleMatches, resolveOpportunityClient } from "../client-context";
import { selectRelevantProducts } from "../catalog";
import { detectCrossClientTerms, validateClientScopedActors } from "../guardrails";
import { generateLocalDrafts } from "../draft-generator";

const clients = [
  {
    id: "pcmidi",
    name: "PC MIDI Center",
    slug: "pcmidi",
    description: "",
    domainKeywords: JSON.stringify(["midiplus", "controlador midi", "daw"]),
    domainExclusions: JSON.stringify(["midi skirt"]),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "prestige",
    name: "PRESTIGE MEDIAS",
    slug: "prestige-running",
    description: "",
    domainKeywords: JSON.stringify(["prestige", "prestige medias", "medias de running", "medias deportivas", "running", "compresion", "trail"]),
    domainExclusions: JSON.stringify(["media hora", "media cancha", "medias medicinales", "a medias"]),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function prismaMock() {
  return {
    monitoredSource: { findUnique: async () => null },
    brand: { findUnique: async () => null },
    client: { findMany: async () => clients },
  } as any;
}

describe("resolveOpportunityClient", () => {
  it("resuelve PC MIDI por keywords musicales", async () => {
    const r = await resolveOpportunityClient(prismaMock(), {
      sourceText: "Consulta sobre controlador MIDI para Ableton DAW",
      detectedBrandId: null,
      monitoredSourceId: null,
    });
    expect(r.client.slug).toBe("pcmidi");
    expect(r.confidence).toBe("high");
  });

  it("resuelve Prestige por running/medias", async () => {
    const r = await resolveOpportunityClient(prismaMock(), {
      sourceText: "Busco medias deportivas para running y trail",
      detectedBrandId: null,
      monitoredSourceId: null,
    });
    expect(r.client.slug).toBe("prestige-running");
    expect(r.confidence).toBe("high");
  });

  it("exclusiones evitan falso positivo de medias", async () => {
    const r = await resolveOpportunityClient(prismaMock(), {
      sourceText: "Tengo media hora para ver un controlador MIDI",
      detectedBrandId: null,
      monitoredSourceId: null,
    });
    expect(r.client.slug).toBe("pcmidi");
  });
});

describe("catalogRuleMatches", () => {
  it("matchea reglas de Prestige", () => {
    const matches = catalogRuleMatches("Tengo dudas con compresion para correr 10K", [
      { category: "running", keywords: JSON.stringify(["running", "correr", "10k"]) },
      { category: "compresion", keywords: JSON.stringify(["compresion", "15-20"]) },
    ]);
    expect(matches).toEqual(["running", "compresion"]);
  });
});

describe("selección explícita de producto", () => {
  it("mantiene el producto elegido primero aunque el comentario nombre otro modelo", () => {
    const minifuse = { id: "minifuse-4", name: "MiniFuse 4", category: "interfaces-audio", description: "Interfaz de audio", useCases: "Grabación", technicalSpecs: "", brand: { name: "Arturia" } } as any;
    const keylab = { id: "keylab-49", name: "KeyLab Essential 49", category: "controladores-midi", description: "Controlador MIDI", useCases: "Ableton", technicalSpecs: "", brand: { name: "Arturia" } } as any;

    const products = selectRelevantProducts("Busco un KeyLab Essential 49 para Ableton", minifuse, 5, {
      catalogProducts: [minifuse, keylab],
      scoped: true,
    });

    expect(products[0]?.id).toBe("minifuse-4");
  });
});

describe("guardrails", () => {
  it("bloquea persona fuera del cliente", () => {
    const result = validateClientScopedActors({
      client: clients[0] as any,
      brand: { id: "b1", name: "MidiPlus", clientId: "pcmidi" } as any,
      persona: { id: "p1", name: "Práctico", clientId: "prestige" } as any,
    });
    expect(result.ok).toBe(false);
  });

  it("detecta terminos de otro cliente", async () => {
    const hits = await detectCrossClientTerms({
      client: {
        findMany: async () => [
          { ...clients[1], brands: [{ name: "Prestige" }] },
        ],
      },
    } as any, "pcmidi", "Recomendaria unas medias deportivas Prestige");
    expect(hits[0]).toContain("prestige-running");
  });
});

describe("local fallback drafts by client", () => {
  const mockOpp = (intent: any, text: string) => ({
    id: "opp1",
    channelId: "c1",
    sourceUrl: "https://youtube.com/123",
    sourceAuthor: "user1",
    sourceText: text,
    signalType: "actionable_question",
    clientId: "pcmidi",
    observedProfileId: null,
    detectedBrandId: "b1",
    detectedProductId: null,
    detectedIntent: intent,
    priority: "MEDIUM" as const,
    opportunityScore: 0,
    contextAssessment: {},
    status: "NEW" as const,
    detectedTopics: [],
    detectedTone: "",
    detectedToneConfidence: "low",
    notes: "",
    monitoredSourceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    channel: { id: "c1", name: "YouTube", type: "video", baseUrl: "", responseStyleNotes: "" },
    detectedBrand: { id: "b1", name: "MidiPlus", clientId: "pcmidi", strengths: "", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: new Date(), updatedAt: new Date() },
    detectedProduct: null,
  });

  const mockBrand = { id: "b1", name: "MidiPlus", clientId: "pcmidi", strengths: "", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: new Date(), updatedAt: new Date() };
  const mockPersona = { id: "p1", clientId: "pcmidi", name: "Técnico", role: "Técnico", tone: "serio", goals: "ayudar", preferredLength: "SHORT", allowedPhrases: "", forbiddenPhrases: "", goodExamples: "", badExamples: "", angle: "tecnico", avatarUrl: "", voiceId: "es-AR-TomasNeural", createdAt: new Date(), updatedAt: new Date() };

  it("genera fallbacks de pcmidi con referencias tecnicas de audio", () => {
    const drafts = generateLocalDrafts({
      opportunity: mockOpp("TECHNICAL_QUESTION", "Tengo un controlador y no suena"),
      brand: mockBrand,
      persona: mockPersona,
      client: { id: "pcmidi", name: "PC MIDI", slug: "pcmidi", description: "", domainKeywords: "", domainExclusions: "", dailyOpportunityTarget: 50, dailyDraftTarget: 50, responsePolicy: {}, opportunitySearchState: {}, autoPublish: false, autoApprove: false, active: true, openrouterApiKey: "", openrouterModel: "", storeUrl: "", blogBaseUrl: "", labName: "", logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "", fromName: "", fromEmail: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", unsubscribeBaseUrl: "", trackBaseUrl: "", geoBrandPatterns: [], createdAt: new Date(), updatedAt: new Date() },
    });
    expect(drafts[0].draftText).toContain("sistema operativo");
  });

  it("genera fallbacks genericos sin referencias tecnicas para otros clientes", () => {
    const drafts = generateLocalDrafts({
      opportunity: mockOpp("TECHNICAL_QUESTION", "Tengo una duda con el producto"),
      brand: { ...mockBrand, clientId: "other", name: "Generic" },
      persona: { ...mockPersona, clientId: "other", name: "Generic Persona" },
      client: { id: "other", name: "Other Client", slug: "other-client", description: "", domainKeywords: "", domainExclusions: "", dailyOpportunityTarget: 50, dailyDraftTarget: 50, responsePolicy: {}, opportunitySearchState: {}, autoPublish: false, autoApprove: false, active: true, openrouterApiKey: "", openrouterModel: "", storeUrl: "", blogBaseUrl: "", labName: "", logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "", fromName: "", fromEmail: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", unsubscribeBaseUrl: "", trackBaseUrl: "", geoBrandPatterns: [], createdAt: new Date(), updatedAt: new Date() },
    });
    expect(drafts[0].draftText).not.toContain("sistema operativo");
    expect(drafts[0].draftText).not.toContain("placa/SO");
    expect(drafts[0].draftText).toContain("especificaciones");
  });

  it("genera fallbacks de Prestige con foco tecnico o de estilo segun la consulta", () => {
    const prestigeBrand = { ...mockBrand, clientId: "prestige", name: "Prestige" };
    const prestigePersona = { ...mockPersona, clientId: "prestige", name: "PrÃ¡ctico" };
    const prestigeClient = { id: "prestige", name: "Prestige", slug: "prestige-running", description: "", domainKeywords: "", domainExclusions: "", dailyOpportunityTarget: 50, dailyDraftTarget: 50, responsePolicy: {}, opportunitySearchState: {}, autoPublish: false, autoApprove: false, active: true, openrouterApiKey: "", openrouterModel: "", storeUrl: "", blogBaseUrl: "", labName: "", logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "", fromName: "", fromEmail: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", unsubscribeBaseUrl: "", trackBaseUrl: "", geoBrandPatterns: [], createdAt: new Date(), updatedAt: new Date() };

    const technicalDrafts = generateLocalDrafts({
      opportunity: mockOpp("TECHNICAL_QUESTION", "Busco medias de compresion para correr 10k"),
      brand: prestigeBrand,
      persona: prestigePersona,
      client: prestigeClient,
    });
    const styleDrafts = generateLocalDrafts({
      opportunity: mockOpp("PURCHASE_QUESTION", "Quiero algo mas fachero y con color para running"),
      brand: prestigeBrand,
      persona: prestigePersona,
      client: prestigeClient,
    });

    expect(technicalDrafts[1].draftText).toContain("compresión puede sentirse");
    expect(technicalDrafts[1].draftText).not.toMatch(/yo miraría|testeadas con atletas/i);
    expect(styleDrafts[2].draftText).toContain("más color o estética");
  });
});

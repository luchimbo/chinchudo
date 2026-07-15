import { describe, expect, it } from "vitest";
import { classifyObservedText, deriveVoiceModulation, getObservedProfileDraftHints } from "../observed-profiles";
import { generateLocalDrafts } from "../draft-generator";

describe("observed profile classification", () => {
  it("keeps multiple interests active while prioritizing current topic", () => {
    const result = classifyObservedText({
      text: "Estoy buscando un piano digital de 88 teclas para practicar en casa, aunque tambien corro 10k los fines de semana",
      detectedIntent: "PURCHASE_QUESTION",
      priority: "HIGH",
    });

    expect(result.primaryTopic).toBe("pianos");
    expect(result.secondaryTopics).toContain("running");
  });

  it("detects casual tone from hobby-like language", () => {
    const result = classifyObservedText({
      text: "Che, lo quiero para correr tranqui y no hacerme ampollas jaja",
      detectedIntent: "GENERAL_DISCUSSION",
      priority: "LOW",
    });

    expect(result.tone).toBe("casual");
  });
});

describe("draft hints from observed profile", () => {
  it("summarizes current and historical context", () => {
    const hints = getObservedProfileDraftHints({
      currentTopic: "pianos",
      currentTopicConfidence: "high",
      historicalPrimaryTopics: ["pianos", "running"],
      historicalSecondaryTopics: ["home-studio"],
      toneProfile: "casual",
      toneConfidence: "medium",
      commercialReadiness: 62,
      signalSummary: "tema actual: pianos",
    });

    expect(hints.join(" ")).toContain("Tema actual detectado: pianos");
    expect(hints.join(" ")).toContain("Intereses historicos: pianos, running");
  });
});

describe("voice modulation", () => {
  it("derives a casual modulation from observed profile", () => {
    const modulation = deriveVoiceModulation({
      currentTopic: "pianos",
      currentTopicConfidence: "high",
      historicalPrimaryTopics: ["pianos", "running"],
      historicalSecondaryTopics: [],
      toneProfile: "casual",
      toneConfidence: "medium",
      commercialReadiness: 40,
      signalSummary: "tema actual: pianos",
    });

    expect(modulation.styleLabel).toBe("casual");
    expect(modulation.introStyle.toLowerCase()).toContain("cercano");
  });
});

describe("draft generator with observed profile context", () => {
  it("keeps piano response focused and only uses history as context", () => {
    const drafts = generateLocalDrafts({
      opportunity: {
        id: "opp-1",
        channelId: "ch-1",
        sourceUrl: "https://example.com",
        sourceAuthor: "usuario",
        sourceText: "Estoy buscando un piano digital para practicar en casa",
        clientId: "client-1",
        observedProfileId: "profile-1",
        detectedBrandId: "brand-1",
        detectedProductId: null,
        detectedIntent: "PURCHASE_QUESTION",
        priority: "HIGH",
        status: "NEW",
        detectedTopics: [],
        detectedTone: "casual",
        detectedToneConfidence: "medium",
        notes: "",
        monitoredSourceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        channel: { id: "ch-1", name: "YouTube", type: "video", baseUrl: "", responseStyleNotes: "" },
        detectedBrand: { id: "brand-1", clientId: "client-1", name: "MidiPlus", strengths: "", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: new Date(), updatedAt: new Date() },
        detectedProduct: null,
      } as any,
      brand: { id: "brand-1", clientId: "client-1", name: "MidiPlus", strengths: "", tone: "", allowedClaims: "", forbiddenClaims: "", competitorWeaknesses: "", createdAt: new Date(), updatedAt: new Date() },
      persona: { id: "persona-1", clientId: "client-1", name: "Técnico", role: "", tone: "", goals: "", preferredLength: "", allowedPhrases: "", forbiddenPhrases: "", goodExamples: "", badExamples: "", angle: "", avatarUrl: "", voiceId: "", createdAt: new Date(), updatedAt: new Date() },
      client: { id: "client-1", name: "PC MIDI", slug: "pcmidi", description: "", domainKeywords: "[]", domainExclusions: "[]", dailyOpportunityTarget: 15, opportunitySearchState: {}, autoPublish: false, autoApprove: false, active: true, openrouterApiKey: "", openrouterModel: "", storeUrl: "", blogBaseUrl: "", labName: "", logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "", fromName: "", fromEmail: "", smtpHost: "", smtpPort: 465, smtpUser: "", smtpPass: "", unsubscribeBaseUrl: "", trackBaseUrl: "", geoBrandPatterns: [], createdAt: new Date(), updatedAt: new Date() },
      observedProfile: {
        currentTopic: "pianos",
        currentTopicConfidence: "high",
        historicalPrimaryTopics: ["pianos", "running"],
        historicalSecondaryTopics: [],
        toneProfile: "casual",
        toneConfidence: "medium",
        commercialReadiness: 55,
        signalSummary: "tema actual: pianos",
      },
    });

    expect(drafts[0].riskNotes).toContain("tema actual pianos");
    expect(drafts[0].draftText.toLowerCase()).toContain("usuario");
    expect(drafts[0].riskNotes.toLowerCase()).toContain("modulación aplicada a la voz");
  });
});

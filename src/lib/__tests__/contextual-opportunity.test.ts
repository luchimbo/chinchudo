import { describe, expect, it } from "vitest";
import { calculateOpportunityScore, isContextualCandidate, normalizeAssessment, prestigeFallbackAssessment, priorityFromOpportunityScore } from "../contextual-opportunity";

describe("contextual opportunity scoring", () => {
  it("acepta un video de técnica con audiencia y contexto demostrables", () => {
    const assessment = normalizeAssessment({ audienceFit: 90, contextFit: 85, problemFit: 65, conversationFit: 60, risk: 10, opportunityType: "contextual_presence", confidence: "high", evidence: { audienceFit: "Plan para preparar 10K", contextFit: "Consejos para correr mejor" }, recommendedApproach: "Aportar un tip de equipamiento" }, "GENERAL_DISCUSSION");
    expect(isContextualCandidate(assessment)).toBe(true);
    expect(calculateOpportunityScore(assessment, "GENERAL_DISCUSSION")).toBeGreaterThanOrEqual(60);
  });

  it("prioriza una pregunta de compra directa", () => {
    const assessment = normalizeAssessment({ audienceFit: 70, contextFit: 70, problemFit: 70, conversationFit: 90, risk: 5, opportunityType: "direct_response", confidence: "high" }, "PURCHASE_QUESTION");
    const score = calculateOpportunityScore(assessment, "PURCHASE_QUESTION");
    expect(score).toBeGreaterThanOrEqual(70);
    expect(priorityFromOpportunityScore(score, "PURCHASE_QUESTION")).not.toBe("LOW");
  });

  it("rechaza afinidad sin evidencia y contenido de riesgo", () => {
    const noEvidence = normalizeAssessment({ audienceFit: 95, contextFit: 95, risk: 5, opportunityType: "contextual_presence", confidence: "high" }, "GENERAL_DISCUSSION");
    const medical = normalizeAssessment({ audienceFit: 90, contextFit: 90, risk: 90, opportunityType: "discard", confidence: "high" }, "GENERAL_DISCUSSION");
    expect(isContextualCandidate(noEvidence)).toBe(false);
    expect(calculateOpportunityScore(medical, "GENERAL_DISCUSSION")).toBe(0);
  });

  it("conserva como alta una oportunidad Prestige de trail ante un timeout", () => {
    const assessment = prestigeFallbackAssessment("Los 10 elementos esenciales que llevo para hacer trail running con seguridad");
    const score = calculateOpportunityScore(assessment, "GENERAL_DISCUSSION");
    expect(assessment.opportunityType).toBe("contextual_presence");
    expect(priorityFromOpportunityScore(score, "GENERAL_DISCUSSION")).toBe("HIGH");
  });

  it("conserva como media una conversación general sobre beneficios del running", () => {
    const assessment = prestigeFallbackAssessment("Cuáles son los beneficios del running para la salud y el estado físico");
    const score = calculateOpportunityScore(assessment, "GENERAL_DISCUSSION");
    expect(priorityFromOpportunityScore(score, "GENERAL_DISCUSSION")).toBe("MEDIUM");
  });
});

import type { OpportunityIntent } from "@prisma/client";

export type OpportunityType = "direct_response" | "contextual_presence" | "discard";
export type ContextEvidence = Partial<Record<"audienceFit" | "contextFit" | "problemFit" | "conversationFit" | "risk", string>>;
export type ContextualAssessment = {
  audienceFit: number;
  contextFit: number;
  problemFit: number;
  conversationFit: number;
  risk: number;
  opportunityType: OpportunityType;
  recommendedApproach: string;
  evidence: ContextEvidence;
  confidence: "high" | "medium" | "low";
};

const directIntents = new Set<OpportunityIntent>([
  "PURCHASE_QUESTION", "PRICE_QUESTION", "TECHNICAL_QUESTION", "WARRANTY_QUESTION", "COMPARISON", "COMPLAINT",
]);

export function clampScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

export function normalizeAssessment(value: Partial<ContextualAssessment> | undefined, intent: OpportunityIntent): ContextualAssessment {
  const rawEvidence = value?.evidence && typeof value.evidence === "object" ? value.evidence : {};
  const evidence: ContextEvidence = {};
  for (const key of ["audienceFit", "contextFit", "problemFit", "conversationFit", "risk"] as const) {
    if (typeof rawEvidence[key] === "string" && rawEvidence[key]?.trim()) evidence[key] = rawEvidence[key]?.trim();
  }
  const assessment: ContextualAssessment = {
    audienceFit: clampScore(value?.audienceFit),
    contextFit: clampScore(value?.contextFit),
    problemFit: clampScore(value?.problemFit),
    conversationFit: clampScore(value?.conversationFit),
    risk: clampScore(value?.risk),
    opportunityType: value?.opportunityType === "contextual_presence" || value?.opportunityType === "discard" ? value.opportunityType : "direct_response",
    recommendedApproach: String(value?.recommendedApproach || "").trim(),
    evidence,
    confidence: value?.confidence === "high" || value?.confidence === "medium" ? value.confidence : "low",
  };
  if (directIntents.has(intent)) assessment.opportunityType = "direct_response";
  return assessment;
}

export function hasContextEvidence(assessment: ContextualAssessment) {
  return ["audienceFit", "contextFit", "problemFit", "conversationFit"].some((key) => Boolean(assessment.evidence[key as keyof ContextEvidence]?.trim()));
}

export function isContextualCandidate(assessment: ContextualAssessment) {
  return assessment.opportunityType === "contextual_presence"
    && assessment.confidence !== "low"
    && assessment.risk < 45
    && assessment.audienceFit >= 70
    && assessment.contextFit >= 65
    && hasContextEvidence(assessment);
}

export function calculateOpportunityScore(assessment: ContextualAssessment, intent: OpportunityIntent) {
  if (assessment.opportunityType === "discard" || assessment.risk >= 70) return 0;
  const directBonus = directIntents.has(intent) ? 30 : intent === "COMPETITOR_MENTION" ? 12 : 0;
  return Math.max(0, Math.min(100, Math.round(
    directBonus + assessment.audienceFit * .25 + assessment.contextFit * .3 + assessment.problemFit * .2 + assessment.conversationFit * .15 - assessment.risk * .35,
  )));
}

export function priorityFromOpportunityScore(score: number, intent: OpportunityIntent): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  if (score >= 85 && (intent === "PURCHASE_QUESTION" || intent === "WARRANTY_QUESTION")) return "URGENT";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export function prestigeFallbackAssessment(text: string): ContextualAssessment {
  const normalized = text.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const strongProductContext = /\b(trail|equipamiento|esenciales|indumentaria|medias?|soquetes?|ampollas?|roce|sudoracion|pies?|calzado|zapatillas)\b/.test(normalized);
  const performanceContext = /\b(running|correr|corredor|entrenamiento|rendimiento|rapido|velocidad|maraton)\b/.test(normalized);
  const healthOnly = /\b(salud|beneficios|estado fisico)\b/.test(normalized) && !strongProductContext;

  const assessment = normalizeAssessment({
    audienceFit: performanceContext || strongProductContext ? 90 : 72,
    contextFit: strongProductContext ? 88 : performanceContext ? 76 : 65,
    problemFit: strongProductContext ? 78 : healthOnly ? 45 : 62,
    conversationFit: strongProductContext ? 72 : healthOnly ? 50 : 62,
    risk: 10,
    opportunityType: "contextual_presence",
    recommendedApproach: strongProductContext
      ? "Aportar valor sobre comodidad, roce y manejo de humedad, y recomendar medias técnicas de forma natural."
      : "Aportar un consejo útil para runners y vincular Prestige solo si la conversación permite hablar de comodidad o equipamiento.",
    evidence: {
      audienceFit: "Contenido dirigido explícitamente a personas que corren o entrenan.",
      contextFit: strongProductContext
        ? "El contenido trata equipamiento o necesidades donde las medias técnicas encajan naturalmente."
        : "El contenido pertenece al contexto concreto de running y entrenamiento.",
      problemFit: strongProductContext
        ? "Prestige puede aportar sobre comodidad, roce y humedad durante la actividad."
        : "Prestige puede aportar valor contextual sin forzar una venta.",
    },
    confidence: strongProductContext ? "high" : "medium",
  }, "GENERAL_DISCUSSION");

  return assessment;
}

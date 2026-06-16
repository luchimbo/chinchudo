import type {
  OpportunityStatus,
  OpportunityPriority,
  OpportunityIntent,
  ResponseVariantType,
} from "@prisma/client";

// Re-exportamos los tipos Prisma como fuente única de verdad
export type { OpportunityStatus, OpportunityPriority, OpportunityIntent, ResponseVariantType };

// Aliases retrocompatibles para no romper código existente
export type OpportunityStatusValue = OpportunityStatus;
export type OpportunityPriorityValue = OpportunityPriority;
export type OpportunityIntentValue = OpportunityIntent;

export const opportunityStatuses: OpportunityStatus[] = [
  "NEW",
  "NEEDS_REVIEW",
  "DRAFTED",
  "APPROVED",
  "PUBLISHED",
  "DISCARDED",
  "FOLLOW_UP",
  "CONVERTED",
];

export const opportunityPriorities: OpportunityPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const opportunityIntents: OpportunityIntent[] = [
  "PURCHASE_QUESTION",
  "TECHNICAL_QUESTION",
  "PRICE_QUESTION",
  "WARRANTY_QUESTION",
  "COMPARISON",
  "COMPLAINT",
  "COMPETITOR_MENTION",
  "GENERAL_DISCUSSION",
];

export const statusLabels: Record<OpportunityStatusValue, string> = {
  NEW: "Nueva",
  NEEDS_REVIEW: "Revisar",
  DRAFTED: "Borrador",
  APPROVED: "Aprobada",
  PUBLISHED: "Publicada",
  DISCARDED: "Descartada",
  FOLLOW_UP: "Seguimiento",
  CONVERTED: "Convertida"
};

export const priorityLabels: Record<OpportunityPriorityValue, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente"
};

export const intentLabels: Record<OpportunityIntentValue, string> = {
  PURCHASE_QUESTION: "Compra",
  TECHNICAL_QUESTION: "Tecnica",
  PRICE_QUESTION: "Precio",
  WARRANTY_QUESTION: "Garantia",
  COMPARISON: "Comparacion",
  COMPLAINT: "Queja",
  COMPETITOR_MENTION: "Competencia",
  GENERAL_DISCUSSION: "General"
};

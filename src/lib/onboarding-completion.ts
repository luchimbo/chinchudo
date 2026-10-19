import type { OnboardingDraft } from "./onboarding";

export type OnboardingCompletionIssue = {
  key: string;
  label: string;
};

/** Labels humanas de los campos del draft, reusadas por los issues de completitud,
 * el checklist del dashboard y el panel de impacto de "Volver a leer mi sitio". */
export const FIELD_LABELS: Record<string, string> = {
  name: "Nombre del negocio",
  brand: "Marca",
  description: "Resumen del negocio",
  offer: "Qué vendés o qué servicio ofrecés",
  targetAudience: "Público objetivo",
  tone: "Tono",
  businessGoals: "Objetivos del negocio",
  topics: "Temas",
  claims: "Lo que sí podés afirmar",
  limits: "Lo que no debe afirmarse",
  selectedNetworks: "Redes donde escuchar",
  "knowledge-0": "Problema que resolvemos",
  "knowledge-1": "Cómo elegir una opción",
  "knowledge-2": "Pregunta frecuente",
};

/** Only business identity and its offer are required to start. */
export function getOnboardingCompletionIssues(
  draft: OnboardingDraft,
): OnboardingCompletionIssue[] {
  const missing: OnboardingCompletionIssue[] = [];
  const requireText = (key: string, label: string, text?: string) => {
    if (!text?.trim()) missing.push({ key, label });
  };
  requireText("name", FIELD_LABELS.name, draft.name);
  requireText("offer", FIELD_LABELS.offer, draft.offer);
  return missing;
}

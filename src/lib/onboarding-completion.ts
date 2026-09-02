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
  offer: "Oferta principal",
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

/** Campos que hacen que las respuestas y la escucha inicial tengan contexto útil. */
export function getOnboardingCompletionIssues(
  draft: OnboardingDraft,
): OnboardingCompletionIssue[] {
  const missing: OnboardingCompletionIssue[] = [];
  const requireText = (key: string, label: string, text?: string) => {
    if (!text?.trim()) missing.push({ key, label });
  };
  requireText("name", FIELD_LABELS.name, draft.name);
  requireText("brand", FIELD_LABELS.brand, draft.brand);
  requireText("description", FIELD_LABELS.description, draft.description);
  requireText("offer", FIELD_LABELS.offer, draft.offer);
  requireText("targetAudience", FIELD_LABELS.targetAudience, draft.targetAudience);
  requireText("tone", FIELD_LABELS.tone, draft.tone);
  if (!(draft.businessGoals || []).some((goal) => goal.trim()))
    missing.push({ key: "businessGoals", label: FIELD_LABELS.businessGoals });
  if (!(draft.topics || []).some((topic) => topic.trim()))
    missing.push({ key: "topics", label: FIELD_LABELS.topics });
  const prompts = draft.knowledgePrompts || [];
  const knowledge = draft.knowledge || [];
  for (let index = 0; index < 3; index += 1) {
    if (!knowledge[index]?.trim())
      missing.push({
        key: `knowledge-${index}`,
        label: prompts[index] || FIELD_LABELS[`knowledge-${index}`] || `Conocimiento ${index + 1}`,
      });
  }
  return missing;
}

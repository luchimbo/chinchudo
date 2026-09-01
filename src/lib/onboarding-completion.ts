import type { OnboardingDraft } from "./onboarding";

export type OnboardingCompletionIssue = {
  key: string;
  label: string;
};

/** Campos que hacen que las respuestas y la escucha inicial tengan contexto útil. */
export function getOnboardingCompletionIssues(
  draft: OnboardingDraft,
): OnboardingCompletionIssue[] {
  const missing: OnboardingCompletionIssue[] = [];
  const requireText = (key: string, label: string, text?: string) => {
    if (!text?.trim()) missing.push({ key, label });
  };
  requireText("name", "Nombre del negocio", draft.name);
  requireText("brand", "Marca", draft.brand);
  requireText("description", "Resumen del negocio", draft.description);
  requireText("offer", "Oferta principal", draft.offer);
  requireText("targetAudience", "Público objetivo", draft.targetAudience);
  requireText("tone", "Tono", draft.tone);
  if (!(draft.businessGoals || []).some((goal) => goal.trim()))
    missing.push({ key: "businessGoals", label: "Objetivos del negocio" });
  if (!(draft.topics || []).some((topic) => topic.trim()))
    missing.push({ key: "topics", label: "Temas" });
  const prompts = draft.knowledgePrompts || [];
  const knowledge = draft.knowledge || [];
  for (let index = 0; index < 3; index += 1) {
    if (!knowledge[index]?.trim())
      missing.push({
        key: `knowledge-${index}`,
        label: prompts[index] || `Conocimiento ${index + 1}`,
      });
  }
  return missing;
}

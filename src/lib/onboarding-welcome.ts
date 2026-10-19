import type { OnboardingDraft } from "./onboarding";

export const WELCOME_CHOICES = [
  { goal: "opportunities", title: "Encontrar oportunidades", description: "Buscá conversaciones donde tu negocio pueda ayudar.", path: "/radar" },
  { goal: "content", title: "Preparar contenido", description: "Prepará artículos y borradores para tu negocio.", path: "/blog" },
  { goal: "responses", title: "Responder consultas", description: "Escribí respuestas con ayuda de Cafishia.", path: "/asistente-cm" },
] as const;
export type FirstUseGoal = typeof WELCOME_CHOICES[number]["goal"];
export function welcomeDestination(goal: FirstUseGoal | "", slug: string) {
  const choice = WELCOME_CHOICES.find(item => item.goal === goal);
  const query = new URLSearchParams({ client: slug });
  if (choice) query.set("firstUse", choice.goal);
  return `${choice?.path || "/"}?${query}`;
}
export function needsWelcome(status: string | undefined, draft: OnboardingDraft) {
  return status === "COMPLETED" && draft.welcomeCompleted === false;
}

/** Reuse confirmed text only; activating does not approve hidden AI knowledge. */
export function activationDraft(draft: Required<OnboardingDraft>, alreadyCompleted: boolean, knowledgeReviewed: boolean) {
  return { ...draft, brand: draft.brand.trim() || draft.name.trim(), description: draft.description.trim() || draft.offer.trim(),
    knowledgeApproved: draft.knowledgeApproved || knowledgeReviewed && draft.knowledge.some(item => item.trim()),
    welcomeCompleted: alreadyCompleted ? draft.welcomeCompleted : false };
}

import { describe, expect, it } from "vitest";
import { defaultDraft, sanitizeDraft, mergeManualFields } from "./onboarding";
import { activationDraft, needsWelcome, welcomeDestination } from "./onboarding-welcome";
import { getOnboardingCompletionIssues } from "./onboarding-completion";

describe("alta mínima y bienvenida", () => {
  it("permite empezar con nombre y oferta sin inventar los datos opcionales", () => {
    const draft = defaultDraft(); draft.name = "Casa Norte"; draft.offer = "Decoración";
    expect(getOnboardingCompletionIssues(draft)).toEqual([]);
    const ready = activationDraft(draft, false, false);
    expect(ready).toMatchObject({ brand: "Casa Norte", description: "Decoración", knowledgeApproved: false, welcomeCompleted: false });
    expect(ready.knowledge).toEqual(["", "", ""]); expect(ready.targetAudience).toBe("");
  });
  it("bloquea solo los dos datos imprescindibles", () => {
    expect(getOnboardingCompletionIssues({ name: " ", offer: " " }).map(issue => issue.key)).toEqual(["name", "offer"]);
  });
  it("no aprueba conocimientos generados que quedaron ocultos", () => {
    const draft = sanitizeDraft({ name: "Negocio", offer: "Clases", knowledge: ["Texto sugerido"] });
    expect(activationDraft(draft, false, false).knowledgeApproved).toBe(false);
    expect(activationDraft(draft, false, true).knowledgeApproved).toBe(true);
  });
  it("mantiene intactas la descripción y marca confirmadas", () => {
    const draft = sanitizeDraft({ name: "Empresa", offer: "Oferta", brand: "Marca confirmada", description: "Descripción confirmada" });
    expect(activationDraft(draft, true, false)).toMatchObject({ brand: draft.brand, description: draft.description, welcomeCompleted: true });
  });
  it("las cuentas antiguas no reciben una bienvenida nueva y las pendientes sobreviven a una nueva lectura", () => {
    expect(needsWelcome("COMPLETED", sanitizeDraft({}))).toBe(false);
    expect(needsWelcome("IN_REVIEW", { welcomeCompleted: false })).toBe(false);
    const previous = sanitizeDraft({ welcomeCompleted: false, firstUseGoal: "responses" });
    const reread = mergeManualFields(defaultDraft(), previous);
    expect(needsWelcome("COMPLETED", reread)).toBe(true);
    expect(reread.firstUseGoal).toBe("responses");
  });
  it.each([["opportunities", "/radar"], ["content", "/blog"], ["responses", "/asistente-cm"], ["", "/"]] as const)("conserva el cliente al elegir %s", (goal, path) => {
    const destination = new URL(welcomeDestination(goal, "cliente con espacios"), "https://suite.test");
    expect(destination.pathname).toBe(path);
    expect(destination.searchParams.get("client")).toBe("cliente con espacios");
    expect(destination.searchParams.get("firstUse")).toBe(goal || null);
  });
});

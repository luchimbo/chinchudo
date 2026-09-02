import { describe, expect, it } from "vitest";
import { sanitizeDraft } from "@/lib/onboarding";
import { getOnboardingProgress } from "@/lib/onboarding-progress";

describe("getOnboardingProgress", () => {
  it("es invisible para un cliente legacy sin fila ClientOnboarding (status null)", () => {
    const progress = getOnboardingProgress({
      status: null,
      currentStep: 1,
      sourceUrl: "",
      draft: sanitizeDraft({}),
      clientSlug: "pcmidi",
    });
    expect(progress.visible).toBe(false);
  });

  it("es invisible cuando el onboarding ya está COMPLETED", () => {
    const progress = getOnboardingProgress({
      status: "COMPLETED",
      currentStep: 3,
      sourceUrl: "https://x.com",
      draft: sanitizeDraft({ name: "Cliente" }),
      clientSlug: "cliente",
    });
    expect(progress.visible).toBe(false);
  });

  it("es visible con NOT_STARTED y marca 'analyze' como el paso actual", () => {
    const progress = getOnboardingProgress({
      status: "NOT_STARTED",
      currentStep: 1,
      sourceUrl: "",
      draft: sanitizeDraft({}),
      clientSlug: "cliente",
    });
    expect(progress.visible).toBe(true);
    expect(progress.steps.find((s) => s.key === "analyze")?.state).toBe("current");
    expect(progress.completedSteps).toBe(0);
  });

  it("marca 'analyze' hecho e 'review' como actual cuando faltan campos", () => {
    const progress = getOnboardingProgress({
      status: "IN_REVIEW",
      currentStep: 2,
      sourceUrl: "https://x.com",
      draft: sanitizeDraft({ name: "Cliente" }), // faltan brand, description, offer, etc.
      clientSlug: "cliente",
    });
    expect(progress.steps.find((s) => s.key === "analyze")?.state).toBe("done");
    expect(progress.steps.find((s) => s.key === "review")?.state).toBe("current");
    expect(progress.steps.find((s) => s.key === "review")?.missing?.length).toBeGreaterThan(0);
    expect(progress.completedSteps).toBe(1);
  });

  it("marca 'review' hecho y 'activate' como actual cuando no faltan campos pero no está COMPLETED", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      description: "Desc",
      offer: "Oferta",
      targetAudience: "Audiencia",
      tone: "Cercano",
      businessGoals: ["Vender"],
      topics: ["tema"],
      knowledge: ["a", "b", "c"],
    });
    const progress = getOnboardingProgress({
      status: "IN_REVIEW",
      currentStep: 2,
      sourceUrl: "https://x.com",
      draft,
      clientSlug: "cliente",
    });
    expect(progress.steps.find((s) => s.key === "review")?.state).toBe("done");
    expect(progress.steps.find((s) => s.key === "activate")?.state).toBe("current");
    expect(progress.completedSteps).toBe(2);
  });

  it("los href de cada paso apuntan a /onboarding con el step correspondiente", () => {
    const progress = getOnboardingProgress({
      status: "NOT_STARTED",
      currentStep: 1,
      sourceUrl: "",
      draft: sanitizeDraft({}),
      clientSlug: "mi-cliente",
    });
    expect(progress.steps.find((s) => s.key === "analyze")?.href).toBe(
      "/onboarding?client=mi-cliente&step=0",
    );
    expect(progress.steps.find((s) => s.key === "review")?.href).toBe(
      "/onboarding?client=mi-cliente&step=1",
    );
    expect(progress.steps.find((s) => s.key === "activate")?.href).toBe(
      "/onboarding?client=mi-cliente&step=2",
    );
  });
});

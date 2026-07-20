import { describe, expect, it } from "vitest";
import { triageOpportunity } from "../opportunity-triage";

describe("opportunity triage", () => {
  it("keeps a relevant low-priority Prestige running conversation", () => {
    const decision = triageOpportunity({
      clientSlug: "prestige-running",
      priority: "LOW",
      sourceText: "Estoy empezando a correr y termino con ampollas por el roce. ¿Qué usan para entrenar más cómodos?",
    });
    expect(decision.action).toBe("keep");
  });

  it("still rejects medical and commercial Prestige content", () => {
    expect(triageOpportunity({ clientSlug: "prestige-running", sourceText: "¿Qué medias curan una lesión de gemelo?" }).action).toBe("discard");
    expect(triageOpportunity({ clientSlug: "prestige-running", sourceText: "Vendo medias deportivas al por mayor, envíos a todo el país" }).action).toBe("discard");
  });
});

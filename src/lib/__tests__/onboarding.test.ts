import { describe, expect, it } from "vitest";
import { generatedKnowledge, sanitizeDraft } from "@/lib/onboarding";

describe("onboarding", () => {
  it("normaliza listas y evita aprobar conocimientos incompletos", () => {
    const draft = sanitizeDraft({ name: "Marca", topics: ["uno", 2, "dos"], knowledge: ["A"] }, "Cliente");
    expect(draft.topics).toEqual(["uno", "dos"]);
    expect(draft.knowledge).toHaveLength(3);
  });

  it("genera conocimiento desde la información aprobada", () => {
    const draft = sanitizeDraft({ brand: "Casa Norte", offer: "asesoramiento", topics: ["compra informada"] });
    expect(generatedKnowledge(draft, "Problema que resolvemos")).toContain("Casa Norte");
  });
});

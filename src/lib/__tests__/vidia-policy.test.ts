import { describe, expect, it } from "vitest";
import { validateDraftForClient } from "../draft-output";
import { makeVidiaDrafts } from "../vidia-policy";

describe("Programa Vidia safeguards", () => {
  it("uses emergency-only language when a public message signals immediate risk", () => {
    const drafts = makeVidiaDrafts("Mi hermano no responde y temo una sobredosis", "Instagram");
    expect(drafts).toHaveLength(3);
    expect(drafts[0].draftText).toMatch(/emergencias locales/i);
    expect(drafts[0].draftText).not.toMatch(/diagnóstico|tratamiento/i);
  });

  it("blocks clinical and guaranteed-result claims", () => {
    expect(validateDraftForClient("Podemos diagnosticarlo y garantizar su recuperación.", "programa-vidia"))
      .toContain("vidia_clinical_or_guaranteed_claim");
  });
});

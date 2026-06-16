import { describe, expect, it } from "vitest";
import { shouldUseAi } from "../draft-policy";

describe("shouldUseAi — dry-run no llama a IA salvo --use-ai", () => {
  it("ejecución normal usa IA", () => {
    expect(shouldUseAi({ dryRun: false, useAi: false })).toBe(true);
  });

  it("dry-run SIN --use-ai NO usa IA (evita gasto accidental)", () => {
    expect(shouldUseAi({ dryRun: true, useAi: false })).toBe(false);
  });

  it("dry-run CON --use-ai sí usa IA (opt-in explícito)", () => {
    expect(shouldUseAi({ dryRun: true, useAi: true })).toBe(true);
  });

  it("ejecución normal con --use-ai usa IA", () => {
    expect(shouldUseAi({ dryRun: false, useAi: true })).toBe(true);
  });
});

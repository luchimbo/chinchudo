import { describe, expect, it } from "vitest";
import { loadActivePrompt } from "../prompts";

// Prisma simulado: solo implementa promptVersion.findFirst.
function fakePrisma(active: { systemPrompt: string } | null) {
  return { promptVersion: { findFirst: async () => active } } as unknown as Parameters<typeof loadActivePrompt>[0];
}

describe("loadActivePrompt", () => {
  it("devuelve el systemPrompt activo", async () => {
    const r = await loadActivePrompt(fakePrisma({ systemPrompt: "Sos un asistente." }));
    expect(r).toBe("Sos un asistente.");
  });

  it("devuelve null si no hay prompt activo", async () => {
    const r = await loadActivePrompt(fakePrisma(null));
    expect(r).toBeNull();
  });

  it("trata el prompt vacío como null", async () => {
    const r = await loadActivePrompt(fakePrisma({ systemPrompt: "   " }));
    expect(r).toBeNull();
  });
});

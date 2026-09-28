import { describe, expect, it, vi } from "vitest";
import { getClientMemories } from "../client-memory";

function memory(id: string, category: string, brandId: string | null, productId: string | null) {
  return {
    id,
    category,
    rule: id,
    source: brandId ? "chat_refinement" : "manual",
    response: brandId ? { brandId, opportunity: { detectedProductId: productId } } : null,
  };
}

describe("aprendizajes usados para una nueva respuesta", () => {
  it("conserva reglas manuales y correcciones de la marca, sin mezclar productos", async () => {
    const rows = [
      memory("no-mira", "tone", "arturia", "minilab"),
      memory("pack-minifuse", "product", "arturia", "minifuse"),
      memory("faders-minilab", "product", "arturia", "minilab"),
      memory("alctron", "tone", "alctron", "microphone"),
      memory("regla-manual", "general", null, null),
    ];
    const findMany = vi.fn(async () => rows);
    const prisma = { clientMemory: { findMany } } as any;

    const selected = await getClientMemories(prisma, "pcmidi", { brandId: "arturia", productId: "minilab" });

    expect(selected.map((item) => item.id)).toEqual(["no-mira", "faders-minilab", "regla-manual"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "pcmidi", active: true } }));
  });
});

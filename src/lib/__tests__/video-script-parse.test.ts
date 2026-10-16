import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ prisma: {} }));

const { parseDraft } = await import("../video-script-generator");

describe("parseDraft", () => {
  it("no repite el cierre como último tramo", () => {
    const draft = parseDraft({
      hookOptions: [{ formulaId: 20, spoken: "No necesitás una batería gigante.", onScreen: "SIN BATERÍA" }],
      beats: [{ spoken: "Imaginate practicar en tu pieza." }, { spoken: "Probá la experiencia en tu espacio." }],
      cta: "Probá la experiencia en tu espacio",
    });
    expect(draft?.beats.map((beat) => beat.spoken)).toEqual(["Imaginate practicar en tu pieza."]);
    expect(draft?.cta).toBe("Probá la experiencia en tu espacio");
  });

  it("acepta el formato viejo hook/bodyText/cta", () => {
    const draft = parseDraft({ hook: "Mirá esto.", bodyText: "Uno.\nDos.", cta: "Escribinos." });
    expect(draft?.hookOptions[0].spoken).toBe("Mirá esto.");
    expect(draft?.beats).toHaveLength(2);
  });
});

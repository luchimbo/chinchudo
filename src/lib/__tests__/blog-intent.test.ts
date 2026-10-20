import { describe, expect, it } from "vitest";
import { assignIntent, balanceWarnings, carryIntent, explicitIntent, intentForSlot, intentModeOf, warningsIntroducedBy, withIntent } from "../blog-intent.mjs";
import { editorialIntentForDate } from "../blog-quality.mjs";

describe("intención editorial del slot", () => {
  const day = new Date("2026-10-21T00:00:00Z");
  const parity = editorialIntentForDate("2026-10-21");
  const opposite = parity === "decision" ? "educational" : "decision";

  it("sin intención explícita usa la paridad de la fecha", () => {
    expect(intentForSlot({ scheduledDate: day, preparation: null })).toBe(parity);
    expect(intentForSlot({ scheduledDate: day, preparation: { language: "es" } })).toBe(parity);
    expect(intentForSlot({ scheduledDate: "2026-10-21", preparation: [] })).toBe(parity);
  });

  it("la intención explícita gana sobre la paridad", () => {
    expect(intentForSlot({ scheduledDate: day, preparation: { editorialIntent: opposite } })).toBe(opposite);
  });

  it("ignora valores inválidos", () => {
    expect(explicitIntent({ editorialIntent: "otra" })).toBeNull();
    expect(intentForSlot({ scheduledDate: day, preparation: { editorialIntent: 3 } })).toBe(parity);
  });

  it("carryIntent conserva la intención al reescribir la preparación y no agrega nada si no había", () => {
    expect(carryIntent({ editorialIntent: "decision", brief: "x" }, { phase: "WAITING" })).toEqual({ phase: "WAITING", editorialIntent: "decision" });
    const next = { phase: "WAITING" };
    expect(carryIntent({ brief: "x" }, next)).toBe(next);
    expect(carryIntent(null, next)).toBe(next);
  });
});

const shift = (day: string, offset: number) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

describe("modo de intención", () => {
  it("solo se activa con intentMode balanced", () => {
    expect(intentModeOf({ blog: { intentMode: "balanced" } })).toBe("balanced");
    expect(intentModeOf({ blog: {} })).toBe("parity");
    expect(intentModeOf(null)).toBe("parity");
    expect(intentModeOf({ blog: { intentMode: "otro" } })).toBe("parity");
  });

  it("withIntent fija solo intenciones válidas", () => {
    expect(withIntent({ language: "es" }, "decision")).toEqual({ language: "es", editorialIntent: "decision" });
    expect(withIntent({ language: "es" }, "xx")).toEqual({ language: "es" });
  });
});

describe("asignación por cuota", () => {
  it("con el calendario vacío alterna día a día", () => {
    const placed: { day: string; intent: "educational" | "decision" }[] = [];
    for (let i = 0; i < 14; i++) { const day = shift("2026-11-01", i); placed.push({ day, intent: assignIntent(day, placed) }); }
    expect(placed.filter(item => item.intent === "educational")).toHaveLength(7);
    for (let i = 1; i < placed.length; i++) expect(placed[i].intent).not.toBe(placed[i - 1].intent);
  });

  it("completa el tipo que falta en la ventana", () => {
    const neighbors = [-3, -2, 2, 3].map(offset => ({ day: shift("2026-11-10", offset), intent: "educational" as const }));
    expect(assignIntent("2026-11-10", neighbors)).toBe("decision");
  });

  it("nunca deja más de 2 seguidos del mismo tipo", () => {
    const neighbors = [{ day: "2026-11-09", intent: "decision" as const }, { day: "2026-11-08", intent: "decision" as const }];
    expect(assignIntent("2026-11-10", neighbors)).toBe("educational");
    const after = [{ day: "2026-11-11", intent: "educational" as const }, { day: "2026-11-12", intent: "educational" as const }];
    expect(assignIntent("2026-11-10", after)).toBe("decision");
  });

  it("una tanda de 14 días asignada con huecos y cargas previas queda dentro de 5 a 9", () => {
    const placed: { day: string; intent: "educational" | "decision" }[] = [{ day: "2026-11-03", intent: "decision" }, { day: "2026-11-04", intent: "decision" }, { day: "2026-11-09", intent: "decision" }];
    for (let i = 0; i < 28; i++) { const day = shift("2026-11-01", i); if (!placed.some(item => item.day === day)) placed.push({ day, intent: assignIntent(day, placed) }); }
    expect(balanceWarnings(placed)).toEqual([]);
  });
});

describe("avisos de equilibrio", () => {
  it("avisa de rachas de más de 2 días", () => {
    const slots = ["2026-11-01", "2026-11-02", "2026-11-03"].map(day => ({ day, intent: "decision" as const }));
    expect(balanceWarnings(slots)).toEqual([expect.stringContaining("3 días seguidos")]);
  });

  it("avisa cuando una tanda completa se sale de 5 a 9", () => {
    const slots = Array.from({ length: 14 }, (_, i) => ({ day: shift("2026-11-01", i), intent: (i % 2 === 0 || i >= 9 ? "decision" : "educational") as "decision" | "educational" }));
    const warnings = balanceWarnings(slots);
    expect(warnings.some(text => text.includes("entre 5 y 9"))).toBe(true);
  });

  it("no avisa por tandas incompletas con pocos artículos", () => {
    expect(balanceWarnings([{ day: "2026-11-01", intent: "decision" }, { day: "2026-11-03", intent: "decision" }])).toEqual([]);
  });
});

describe("avisos que introduce una elección", () => {
  const run = [{ day: "2026-11-01", intent: "decision" as const }, { day: "2026-11-02", intent: "decision" as const }];

  it("avisa solo del problema nuevo, no de los que ya existían", () => {
    expect(warningsIntroducedBy(run, "2026-11-03", "decision")).toEqual([expect.stringContaining("3 días seguidos")]);
    expect(warningsIntroducedBy(run, "2026-11-03", "educational")).toEqual([]);
  });

  it("no repite avisos previos cuando el calendario ya estaba desbalanceado", () => {
    const already = [...run, { day: "2026-11-03", intent: "decision" as const }];
    expect(balanceWarnings(already)).not.toEqual([]);
    expect(warningsIntroducedBy(already, "2026-11-10", "educational")).toEqual([]);
  });

  it("reemplazar el tipo de un día ya ocupado lo evalúa sin duplicarlo", () => {
    expect(warningsIntroducedBy([...run, { day: "2026-11-03", intent: "educational" as const }], "2026-11-03", "decision")).toEqual([expect.stringContaining("3 días seguidos")]);
  });
});

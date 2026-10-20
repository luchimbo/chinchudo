import { describe, expect, it } from "vitest";
import { carryIntent, explicitIntent, intentForSlot } from "../blog-intent.mjs";
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

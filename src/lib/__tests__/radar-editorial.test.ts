import { describe, expect, it } from "vitest";
import { evaluateEditorialSignal, selectCopilotPulse } from "../radar-editorial";

const now = new Date("2026-08-04T15:00:00.000Z");
const signal = (overrides = {}) => ({ id: "signal", title: "Tema liviano", description: "Una conversación reciente.", sourceUrl: "https://example.com", platform: "TWITTER", createdAt: new Date("2026-08-04T10:00:00.000Z"), ...overrides });

describe("radar editorial", () => {
  it("permite humor solo para una tendencia reciente y segura", () => {
    const result = evaluateEditorialSignal(signal(), now);
    expect(result.showInCopilot).toBe(true);
    expect(result.allowHumor).toBe(true);
  });

  it("no habilita humor en noticias sensibles aunque sean recientes", () => {
    const result = evaluateEditorialSignal(signal({ platform: "ARGENTINE_PRESS", title: "Tragedia en una ciudad", metadata: { sensitivity: "needs_review" } }), now);
    expect(result.allowHumor).toBe(false);
    expect(result.showInCopilot).toBe(false);
  });

  it("muestra pocas señales útiles antes que un feed completo", () => {
    const selected = selectCopilotPulse([signal(), signal({ id: "old", createdAt: new Date("2026-07-28T10:00:00.000Z") })], now);
    expect(selected.map((item) => item.id)).toEqual(["signal"]);
  });
});

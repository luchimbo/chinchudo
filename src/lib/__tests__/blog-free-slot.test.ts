import { describe, expect, it } from "vitest";
import { nextFreeEditorialDay, withDateHistory } from "../blog-free-slot.mjs";
import { editorialIntentForDate } from "../blog-quality.mjs";
import { connectionIssues } from "@/app/(app)/(creador)/blog/calendario/agent-connection";

describe("próximo día libre editorial", () => {
  const intent = editorialIntentForDate("2026-10-20");

  it("conserva el día pedido si encaja y está libre", () => {
    expect(nextFreeEditorialDay({ from: "2026-10-22", intent, isTaken: () => false })).toBe("2026-10-22");
  });

  it("avanza un día si la intención no coincide y salta de a 2 los ocupados", () => {
    const taken = new Set(["2026-10-22", "2026-10-24"]);
    expect(nextFreeEditorialDay({ from: "2026-10-21", intent, isTaken: (day) => taken.has(day) })).toBe("2026-10-26");
  });

  it("falla si no hay lugar dentro del límite", () => {
    expect(() => nextFreeEditorialDay({ from: "2026-10-20", intent, isTaken: () => true, limit: 3 })).toThrow("día libre");
  });
});

describe("historial de fechas", () => {
  it("conserva el plan y acota el historial a 20 movimientos", () => {
    let preparation: unknown = { productId: "p1" };
    for (let i = 0; i < 25; i++) preparation = withDateHistory(preparation, { from: "2026-10-20", to: "2026-10-22", reason: "reschedule" });
    const result = preparation as { productId: string; dateHistory: unknown[] };
    expect(result.productId).toBe("p1");
    expect(result.dateHistory).toHaveLength(20);
  });

  it("acepta una preparación vacía", () => {
    expect(withDateHistory(null, { from: "a", to: "b", reason: "displaced" })).toMatchObject({ dateHistory: [{ from: "a", to: "b", reason: "displaced" }] });
  });
});

describe("avisos del agente local", () => {
  const code = (loaded: string, stale = false) => ({ ok: true, blogCode: { loaded, disk: stale ? "otro" : loaded, stale } });

  it("no avisa cuando todo corre la misma versión", () => {
    expect(connectionIssues(code("a"), code("a"))).toEqual([]);
  });

  it("avisa que el agente está caído", () => {
    expect(connectionIssues(null, null)).toEqual([expect.stringContaining("sin conexión")]);
  });

  it("detecta procesos con cambios sin aplicar, versiones distintas y procesos viejos", () => {
    expect(connectionIssues(code("a", true), code("a"))).toEqual([expect.stringContaining("cambios sin aplicar")]);
    expect(connectionIssues(code("a"), code("b"))).toEqual([expect.stringContaining("versiones distintas")]);
    expect(connectionIssues({ ok: true }, code("a"))).toEqual([expect.stringContaining("sin control de versiones")]);
    expect(connectionIssues(code("a"), null)).toEqual([expect.stringContaining("no responde")]);
  });
});

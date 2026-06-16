import { describe, expect, it } from "vitest";
import { selectRelevantKnowledge, selectRelevantObjections } from "../knowledge";

const kb = [
  { topic: "Garantia MidiPlus", content: "Se venden con garantia oficial; conservar factura.", brandId: "midi", productId: null },
  { topic: "Compatibilidad USB", content: "Class-compliant por USB, sin driver en Windows o Mac.", brandId: "midi", productId: null },
  { topic: "Linea Kressmer", content: "Diseno premium, consultar stock.", brandId: "kress", productId: null },
  { topic: "Parches malla", content: "Bajan el ruido para vecinos en departamento.", brandId: "midi", productId: "p1" },
];

describe("selectRelevantKnowledge", () => {
  it("matchea por keywords del comentario", () => {
    const r = selectRelevantKnowledge({ sourceText: "¿necesita driver en windows?", brandId: "midi" }, kb);
    expect(r[0].topic).toBe("Compatibilidad USB");
  });

  it("respeta el scope de marca (no trae Kressmer si la marca es midi)", () => {
    const r = selectRelevantKnowledge({ sourceText: "diseno premium", brandId: "midi" }, kb);
    expect(r.find((k) => k.brandId === "kress")).toBeUndefined();
  });

  it("prioriza la entrada del producto detectado", () => {
    const r = selectRelevantKnowledge(
      { sourceText: "el ruido para los vecinos del departamento", brandId: "midi", productId: "p1" },
      kb
    );
    expect(r[0].topic).toBe("Parches malla");
  });

  it("no devuelve nada si no hay overlap", () => {
    const r = selectRelevantKnowledge({ sourceText: "xyzzy plugh", brandId: "midi" }, kb);
    expect(r).toHaveLength(0);
  });
});

const objs = [
  { objection: "Es muy barato debe ser malo", recommendedAnswer: "El precio de entrada no define calidad.", brandId: null, productId: null },
  { objection: "Necesita drivers complicados", recommendedAnswer: "La mayoria es plug-and-play por USB.", brandId: "midi", productId: null },
];

describe("selectRelevantObjections", () => {
  it("matchea objeciones globales y por marca", () => {
    const r = selectRelevantObjections({ sourceText: "me parece barato eso", brandId: "midi" }, objs);
    expect(r.some((o) => o.objection.includes("barato"))).toBe(true);
  });

  it("respeta max", () => {
    const r = selectRelevantObjections({ sourceText: "barato drivers", brandId: "midi" }, objs, 1);
    expect(r).toHaveLength(1);
  });
});

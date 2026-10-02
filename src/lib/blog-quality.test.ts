import { describe, expect, it } from "vitest";
import { catalogSources, editorialIntentForDate, reviewArticle, type EditorialSource } from "./blog-quality.mjs";
import { blogReferral } from "./blog-referrals";

const products = { uno: { nombre: "MidiPlus Uno", url: "https://tienda.test/uno", uso: "MidiPlus Uno tiene 25 teclas." }, dos: { nombre: "Kressmer Dos", url: "https://tienda.test/dos", uso: "Kressmer Dos tiene 49 teclas." } };
const sources = catalogSources(products, "2026-10-01T10:00:00Z");
const article = (extra: Record<string, any> = {}) => ({
  keyword: "elegir un controlador midi", h1: "Cómo elegir un controlador MIDI para practicar", seo_title: "Elegir un controlador MIDI según tu uso", meta_description: "Criterios prácticos para comparar controladores y decidir según la forma en que querés tocar y practicar.",
  direct_answer: "Elegí un controlador según cómo querés tocar, el lugar en tu escritorio y los controles que necesitás para trabajar con tu música.",
  sections: [{ h2: "¿Cómo vas a tocar?", body: "Elegí la [[c:midi|categoría]] según tu forma de tocar." }, { h2: "¿Qué priorizar?", body: "Mirá el [[p:uno]]." }, { h2: "¿Qué comprobar?", body: "Revisá la compatibilidad antes de comprar." }],
  faqs: [{ q: "¿Cómo organizo mi espacio?", a: "Medí el escritorio antes de decidir." }], source_refs: [], editorial_intent: "educational", components: [{ why: "Espacio", look: "Medí tu escritorio" }, { why: "Uso", look: "Definí tu forma de tocar" }], ...extra,
});
const review = (content: Record<string, any>, bank = sources) => reviewArticle({ content, sources: bank, products, categories: { midi: { nombre: "Controladores MIDI" } }, now: "2026-10-02T10:00:00Z" });

describe("calidad SEO, AEO, GEO y DEO", () => {
  it("revisa SEO, AEO y GEO en una guía educativa", () => {
    const result = review(article());
    expect(result.publishable).toBe(true);
    expect(new Set(result.checks.map((c) => c.group))).toEqual(new Set(["SEO", "AEO", "GEO"]));
  });
  it("no bloquea por afirmaciones sin una fuente explícita", () => {
    const result = review(article({ direct_answer: "MidiPlus Uno tiene 88 teclas, el mejor precio y está disponible para entrega inmediata." }));
    expect(result.checks.find((c) => c.id === "claims")?.level).toBe("ok");
  });
  it("no exige criterios ni alternativas en artículos de elección", () => {
    const result = review(article({ editorial_intent: "decision" }));
    expect(result.publishable).toBe(true);
    expect(result.checks.some((c) => c.id === "decision" || c.id === "comparison")).toBe(false);
  });
  it("no avisa por enlaces fuera del catálogo", () => {
    const result = review(article({ sections: [...article().sections, { h2: "Otro", body: "Mirá el [[p:no-existe]]." }] }));
    expect(result.checks.find((c) => c.id === "catalog")?.message).not.toContain("fuera del catálogo");
  });
  it("es solo informativa: nunca bloquea ni marca errores", () => {
    const cases = [
      reviewArticle({ content: article(), sources: [], products, existing: [{ keyword: article().keyword }] }),
      review(article({ direct_answer: "" })),
      review(article({ source_refs: [{ id: "inventado" }] })),
      review(article({ source_refs: sources }), []),
      review({ sections: {} }),
    ];
    for (const result of cases) {
      expect(result.publishable).toBe(true);
      expect(result.checks.some((c) => c.level === "error")).toBe(false);
    }
  });
  it("equilibra siete educativos y siete de elección en cualquier tanda de 14 días", () => {
    const intents = Array.from({ length: 14 }, (_, i) => editorialIntentForDate(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)));
    expect(intents.filter((i) => i === "educational")).toHaveLength(7);
    expect(intents.filter((i) => i === "decision")).toHaveLength(7);
  });
});

it("identifica referencias observadas sin confundir dominios parecidos", () => {
  expect(blogReferral("https://chatgpt.com/c/1")).toBe("ChatGPT");
  expect(blogReferral("https://chatgpt.com.evil.test/")).toBe("Otras referencias");
  expect(blogReferral("")).toBe("Sin referencia identificable");
  expect(blogReferral("https://www.google.com.ar/search?q=midi")).toBe("Google");
});

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
  it("revisa los cuatro enfoques también en una guía educativa", () => {
    const result = review(article());
    expect(result.publishable).toBe(true);
    expect(new Set(result.checks.map((c) => c.group))).toEqual(new Set(["SEO", "AEO", "GEO", "DEO"]));
  });
  it("rechaza especificaciones sin respaldo aunque exista una fuente listada", () => {
    const content = article({ source_refs: sources, direct_answer: "MidiPlus Uno tiene 88 teclas y compatibilidad universal [[s:catalog-uno]]." });
    expect(review(content).publishable).toBe(false);
  });
  it("distingue criterios generales de afirmaciones concretas sobre precio y superioridad", () => {
    expect(review(article({ direct_answer: "Elegir auriculares no es solo cuestión de precio. La mejor elección depende de tu flujo de trabajo y de tu espacio." })).publishable).toBe(true);
    expect(review(article({ direct_answer: "MidiPlus Uno tiene el mejor precio y está disponible para entrega inmediata." })).publishable).toBe(false);
  });
  it("permite atribuciones literales sin autorizar ventajas añadidas", () => {
    const bank = [{ ...sources[0], claims: ["controlador compacto con 25 teclas"] }];
    const body = 'MidiPlus Uno es un “controlador compacto con 25 teclas” [[s:catalog-uno]].';
    expect(review(article({ source_refs: bank, sections: [...article().sections, { h2: "Ficha", body }] }), bank).publishable).toBe(true);
    expect(review(article({ source_refs: bank, sections: [...article().sections, { h2: "Ficha", body: body.replace('”', ' y baja latencia”') }] }), bank).publishable).toBe(false);
  });
  it("acepta una afirmación explícita citada que revisó el operador", () => {
    const content = article({ source_refs: [sources[0]], sections: [...article().sections, { h2: "Dato de la ficha", body: "MidiPlus Uno tiene 25 teclas [[s:catalog-uno]]." }] });
    expect(review(content).publishable).toBe(true);
  });
  it("rechaza fuentes inventadas y modificaciones de una fuente válida", () => {
    expect(review(article({ source_refs: [{ ...sources[0], url: "https://inventado.test" }] })).publishable).toBe(false);
    expect(review(article({ source_refs: [{ id: "inventado" }] })).publishable).toBe(false);
  });
  it("no autoriza testimonios con una cita del catálogo", () => {
    expect(review(article({ source_refs: sources, sections: [...article().sections, { h2: "Caso", body: "Nuestro cliente aumentó sus ventas 40% [[s:catalog-uno]]." }] })).publishable).toBe(false);
  });
  it("exige criterios, evidencia y limitaciones en artículos de elección", () => {
    expect(review(article({ editorial_intent: "decision" })).publishable).toBe(false);
    const decision = { criteria: ["Forma de tocar", "Espacio disponible"], options: Object.keys(products).map((id) => ({ product_id: id, suitable_for: "Quien prioriza su práctica", advantages: "Una alternativa para evaluar", limitations: "Confirmá las conexiones antes de decidir", evidence_ids: [`catalog-${id}`] })), recommendation: "Compará según tu espacio y la forma en que tocás." };
    expect(review(article({ editorial_intent: "decision", source_refs: sources, decision_support: decision })).publishable).toBe(true);
    decision.options[0].limitations = "";
    expect(review(article({ editorial_intent: "decision", source_refs: sources, decision_support: decision })).publishable).toBe(false);
  });
  it("bloquea duplicados y respuestas iniciales vacías", () => {
    expect(reviewArticle({ content: article(), sources: [], products, existing: [{ keyword: article().keyword }] }).publishable).toBe(false);
    expect(review(article({ direct_answer: "" })).publishable).toBe(false);
  });
  it("una fuente revocada deja de habilitar la publicación", () => {
    expect(review(article({ source_refs: sources }), []).publishable).toBe(false);
  });
  it("equilibra siete educativos y siete de elección en cualquier tanda de 14 días", () => {
    const intents = Array.from({ length: 14 }, (_, i) => editorialIntentForDate(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)));
    expect(intents.filter((i) => i === "educational")).toHaveLength(7);
    expect(intents.filter((i) => i === "decision")).toHaveLength(7);
  });
  it("rechaza datos mal formados y fuentes con fecha futura", () => {
    expect(review({ sections: {} }).publishable).toBe(false);
    const future = [{ ...sources[0], verifiedAt: "2099-01-01T00:00:00Z" }] as EditorialSource[];
    expect(review(article({ source_refs: future }), future).publishable).toBe(false);
  });
});

it("identifica referencias observadas sin confundir dominios parecidos", () => {
  expect(blogReferral("https://chatgpt.com/c/1")).toBe("ChatGPT");
  expect(blogReferral("https://chatgpt.com.evil.test/")).toBe("Otras referencias");
  expect(blogReferral("")).toBe("Sin referencia identificable");
  expect(blogReferral("https://www.google.com.ar/search?q=midi")).toBe("Google");
});

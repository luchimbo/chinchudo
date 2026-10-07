import { describe, expect, it } from "vitest";
import { completeArticle } from "./article-completion.mjs";
import { articleChecks, draftFromContent } from "./article-edit";
import { catalogSources, reviewArticle } from "./blog-quality.mjs";

const catalog = {
  products: [{ ref: "minilab", name: "Arturia MiniLab 3 Controlador MIDI", aliases: ["MiniLab 3", "Arturia MiniLab 3"] }, { ref: "keylab", name: "Arturia KeyLab 61", aliases: ["KeyLab 61"] }],
  categories: [{ ref: "midi", name: "Controladores MIDI" }],
  guides: [{ ref: "guia-midi", name: "Cómo elegir controladores MIDI", keyword: "controlador MIDI" }],
};
const products = { minilab: { nombre: catalog.products[0].name, url: "https://store.example/minilab", uso: "Controlador MIDI" }, keylab: { nombre: catalog.products[1].name, url: "https://store.example/keylab", uso: "Controlador MIDI" } };
const sources = catalogSources(products);
const content = { slug: "teclas-midi", keyword: "controlador MIDI teclas", h1: "Cuántas teclas necesita un controlador MIDI", seo_title: "Cómo elegir un controlador MIDI según la cantidad de teclas para tu estudio", hero_lede: "Una guía práctica.", meta_description: "Criterios para elegir según tu espacio y el uso real.", direct_answer: "La cantidad de teclas depende del espacio disponible y de las partes que quieras interpretar.", sections: [{ h2: "25 teclas", body: "El Arturia MiniLab 3 ocupa poco espacio." }, { h2: "61 teclas", body: "El KeyLab 61 permite tocar con ambas manos." }, { h2: "Otros criterios", body: "Compará según tu espacio y tu uso." }], faqs: [], source_refs: [], product_ids: [] };

describe("completar artículos automáticamente", () => {
  it("convierte nombres reales en enlaces, cita sus fichas y enlaza una guía pertinente", () => {
    const result = completeArticle({ content, catalog, sources });
    const draft = draftFromContent(result.content);
    expect(articleChecks(draft, draft, catalog).find(c => c.id === "store")?.level).toBe("ok");
    expect(articleChecks(draft, draft, catalog).find(c => c.id === "guides")?.level).toBe("ok");
    const quality = reviewArticle({ content: result.content, products, sources });
    expect(quality.checks.filter(c => ["catalog", "sources", "claims", "unused-sources"].includes(c.id)).every(c => c.level === "ok")).toBe(true);
    expect(result.content.sections[0].body).toContain("[[p:minilab|Arturia MiniLab 3]] [[s:catalog-minilab]]");
    expect(result.content.seo_title.length).toBeLessThanOrEqual(70);
    expect(content.sections[0].body).toBe("El Arturia MiniLab 3 ocupa poco espacio.");
  });
  it("preserva enlaces manuales y es idempotente, sin marcadores anidados", () => {
    const first = completeArticle({ content: { ...content, sections: [{ h2: "Modelo", body: "Compará [[p:minilab|mi controlador MiniLab 3]] con el KeyLab 61." }] }, catalog, sources });
    const second = completeArticle({ content: first.content, catalog, sources });
    expect(second.content).toEqual(first.content);
    expect(second.changes).toEqual([]);
    expect(first.content.sections[0].body).toContain("[[p:minilab|mi controlador MiniLab 3]]");
    expect(first.content.sections[0].body).not.toContain("[[p:minilab|mi controlador [[");
  });
  it("no fuerza productos retirados, guías ajenas al tema ni fuentes inexistentes", () => {
    const result = completeArticle({ content, catalog: { ...catalog, products: catalog.products.map(p => ({ ...p, disabled: true })), guides: [{ ref: "zapatillas", name: "Cómo elegir zapatillas para correr" }] }, sources: [] });
    expect(result.content.sections.some((s: any) => s.body.includes("[["))).toBe(false);
    expect(result.content.source_refs).toEqual([]);
    expect(result.relatedAvailable).toBe(false);
  });
  it("no confunde marcas o nombres genéricos con modelos de productos", () => {
    const result = completeArticle({ content: { ...content, sections: [{ h2: "Marcas", body: "Arturia, Meike y MIDIPLUS ofrecen equipos. Podés tocar el teclado." }] }, catalog: { products: [{ ref: "auriculares", name: "Auriculares Meike MKH722", aliases: ["Meike"] }, { ref: "arturia", name: "Arturia DrumBrute", aliases: ["Arturia"] }, { ref: "teclado", name: "Teclado controlador MIDI MIDIPLUS AKM320", aliases: ["MIDIPLUS", "teclado"] }], categories: [], guides: [] }, sources });
    expect(result.content.sections[0].body).not.toContain("[[");
  });
  it("conserva investigación como investigación y no la presenta como evidencia revisada", () => {
    const research = { id: "analysis-run-0", type: "external", url: "https://research.example", title: "Página examinada" };
    const result = completeArticle({ content: { ...content, analysis_run_id: "run", source_refs: [research] }, catalog, sources });
    expect(result.content.research_source_urls).toContain(research.url);
    expect(result.content.source_refs.every((s: any) => s.type === "catalog" && s.reviewedBy)).toBe(true);
  });
});

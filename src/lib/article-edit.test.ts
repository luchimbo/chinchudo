import { describe, expect, it } from "vitest";
import { applyArticleDraft, articleChecks, changedBlocks, draftFromContent } from "./article-edit";
import type { ArticleCatalog } from "./article-markers";

const catalog: ArticleCatalog = {
  products: [{ ref: "minilab-3", name: "Arturia MiniLab 3" }],
  categories: [{ ref: "interfaces", name: "Interfaces de audio" }, { ref: "controladores-midi", name: "Controladores MIDI" }],
  guides: [{ ref: "guia-completa", name: "Guía completa" }],
};

const content = {
  keyword: "controlador midi",
  h1: "Cómo elegir un controlador MIDI",
  seo_title: "Cómo elegir un controlador MIDI para tu home studio",
  meta_description: "Criterios prácticos para elegir un controlador MIDI según tu espacio, tu software y tu forma de tocar.",
  hero_lede: "Bajada.",
  direct_answer: "Respuesta directa.",
  sections: [
    { h2: "Qué resuelve", body: "Un [[c:controladores-midi|controlador]] sirve.\n\nY el [[p:minilab-3]] entra en el escritorio." },
    { h2: "Viejo", body: "Esto cita [[p:descontinuado]] que ya no está." },
  ],
  faqs: [{ q: "¿Sirve?", a: "Sí." }],
  brand_solution: { title: "Dónde", body: "En el local.", cta: "Ver" },
  product_ids: ["minilab-3"],
};

describe("aplicar ediciones de artículos", () => {
  it("conserva las comparativas y fuentes cuando se edita el cuerpo", () => {
    const source = { id: "source-1", title: "Manual" };
    const decision = { criteria: ["Uso", "Espacio"], options: [], recommendation: "Elegí según tu uso." };
    const before = { ...content, source_refs: [source], decision_support: decision };
    const draft = draftFromContent(before); draft.h1 = "Nuevo título";
    const result = applyArticleDraft(before, draft, catalog);
    expect(result.ok && result.content.source_refs).toEqual([source]);
    expect(result.ok && result.content.decision_support).toEqual(decision);
    expect(changedBlocks(draftFromContent(before), { ...draftFromContent(before), decision: null }).map((b) => b.after.id)).toEqual(["decision"]);
  });
  it("sin cambios conserva el texto exacto y el resto del JSON", () => {
    const result = applyArticleDraft(content, draftFromContent(content), catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.sections).toEqual(content.sections);
    expect(result.content.product_ids).toEqual(["minilab-3"]);
    expect(result.content.brand_solution.cta).toBe("Ver");
  });

  it("aplica el texto editado y tolera referencias heredadas fuera del catálogo", () => {
    const draft = draftFromContent(content);
    draft.sections[0].body = "Un [[c:interfaces|interfaz]] nueva.";
    draft.h1 = "  Título nuevo  ";
    const result = applyArticleDraft(content, draft, catalog);
    expect(result.ok && result.content.sections[0].body).toBe("Un [[c:interfaces|interfaz]] nueva.");
    expect(result.ok && result.content.h1).toBe("Título nuevo");
    expect(result.ok && result.content.titulo).toBe("Título nuevo");
  });

  it("rechaza referencias nuevas fuera del catálogo", () => {
    const draft = draftFromContent(content);
    draft.sections[0].body += " [[p:inventado]]";
    const result = applyArticleDraft(content, draft, catalog);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("p:inventado") });
  });

  it("rechaza campos vacíos, largos excedidos y cambios de estructura", () => {
    expect(applyArticleDraft(content, { ...draftFromContent(content), lede: " " }, catalog).ok).toBe(false);
    expect(applyArticleDraft(content, { ...draftFromContent(content), seoTitle: "x".repeat(71) }, catalog).ok).toBe(false);
    expect(applyArticleDraft(content, { ...draftFromContent(content), faqs: Array.from({ length: 13 }, () => ({ q: "Pregunta", a: "Respuesta" })) }, catalog).ok).toBe(false);
  });

  it("detecta solo los bloques realmente cambiados", () => {
    const original = draftFromContent(content);
    const edited = draftFromContent(content);
    edited.sections[0].body = original.sections[0].body.replace("\n\n", "\n\n\n  ");
    expect(changedBlocks(original, edited)).toHaveLength(0);
    edited.sections[1].h2 = "Nuevo";
    expect(changedBlocks(original, edited).map((item) => item.after.id)).toEqual(["section-1-h2"]);
  });

  it("los chequeos distinguen errores de advertencias", () => {
    const original = draftFromContent(content);
    const levels = Object.fromEntries(articleChecks(original, original, catalog).map((check) => [check.id, check.level]));
    expect(levels).toMatchObject({ empty: "ok", invalid: "warning", store: "ok", guides: "warning", seoTitle: "ok", description: "ok" });
    const broken = { ...original, sections: [{ h2: "x", body: "[[p:inventado]]" }, original.sections[1]] };
    expect(articleChecks(broken, original, catalog).find((check) => check.id === "invalid")?.level).toBe("error");
  });
});

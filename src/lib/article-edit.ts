// Edición de artículos del blog: el borrador que maneja el editor visual, los
// chequeos previos al guardado y su aplicación sobre el JSON de htmlContent.
import { invalidMarkers, normalizeBody, parseMarkers, type ArticleCatalog } from "./article-markers";
import type { DecisionSupport } from "./blog-quality.mjs";

export type ArticleSection = { h2: string; body: string };
export type ArticleFaq = { q: string; a: string };
export type ArticleDraft = {
  keyword: string;
  h1: string;
  seoTitle: string;
  description: string;
  lede: string;
  answer: string;
  sections: ArticleSection[];
  faqs: ArticleFaq[];
  solutionTitle: string;
  solutionBody: string;
  sourceIds?: string[];
  decision?: DecisionSupport | null;
};

export const ARTICLE_LIMITS = {
  keyword: 160,
  h1: 130,
  seoTitle: 70,
  description: 180,
  lede: 500,
  answer: 2000,
  h2: 150,
  body: 8000,
  q: 200,
  a: 2000,
  solutionTitle: 150,
  solutionBody: 2000,
} as const;

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function draftFromContent(content: Record<string, any>, fallback: { keyword?: string; titulo?: string; seoTitle?: string; seoDescription?: string } = {}): ArticleDraft {
  return {
    keyword: text(content.keyword) || fallback.keyword || "",
    h1: text(content.h1) || fallback.titulo || "",
    seoTitle: text(content.seo_title) || fallback.seoTitle || "",
    description: text(content.meta_description) || fallback.seoDescription || "",
    lede: text(content.hero_lede),
    answer: text(content.direct_answer),
    sections: Array.isArray(content.sections) ? content.sections.map((section: any) => ({ h2: text(section?.h2), body: text(section?.body) })) : [],
    faqs: Array.isArray(content.faqs) ? content.faqs.map((faq: any) => ({ q: text(faq?.q), a: text(faq?.a) })) : [],
    solutionTitle: text(content.brand_solution?.title),
    solutionBody: text(content.brand_solution?.body),
    sourceIds: Array.isArray(content.source_refs) ? content.source_refs.map((s: any) => s.id).filter((id: unknown) => typeof id === "string") : [],
    decision: content.decision_support || null,
  };
}

/** Campos con marcadores de enlaces (se comparan normalizados). */
const richFields = (draft: ArticleDraft) => [draft.answer, draft.solutionBody, ...draft.sections.map((section) => section.body)];
const allText = (draft: ArticleDraft) => [...richFields(draft), draft.lede, ...draft.faqs.map((faq) => faq.a)].join("\n\n");

/** Bloques del artículo con su texto, para detectar y mostrar cambios. */
export type ArticleBlock = { id: string; label: string; value: string; rich: boolean };

export function articleBlocks(draft: ArticleDraft): ArticleBlock[] {
  return [
    { id: "keyword", label: "Búsqueda objetivo", value: draft.keyword, rich: false },
    { id: "seoTitle", label: "Título SEO", value: draft.seoTitle, rich: false },
    { id: "description", label: "Descripción SEO", value: draft.description, rich: false },
    { id: "h1", label: "Título", value: draft.h1, rich: false },
    { id: "lede", label: "Bajada", value: draft.lede, rich: false },
    { id: "answer", label: "Respuesta directa", value: draft.answer, rich: true },
    { id: "sourceIds", label: "Fuentes", value: JSON.stringify(draft.sourceIds || []), rich: false },
    { id: "decision", label: "Comparativa", value: JSON.stringify(draft.decision || null), rich: false },
    ...draft.sections.flatMap((section, index) => [
      { id: `section-${index}-h2`, label: `Sección ${index + 1} · subtítulo`, value: section.h2, rich: false },
      { id: `section-${index}-body`, label: `Sección ${index + 1} · texto`, value: section.body, rich: true },
    ]),
    { id: "solutionTitle", label: "Cierre · título", value: draft.solutionTitle, rich: false },
    { id: "solutionBody", label: "Cierre · texto", value: draft.solutionBody, rich: true },
    ...draft.faqs.flatMap((faq, index) => [
      { id: `faq-${index}-q`, label: `Pregunta ${index + 1}`, value: faq.q, rich: false },
      { id: `faq-${index}-a`, label: `Respuesta ${index + 1}`, value: faq.a, rich: false },
    ]),
  ];
}

const comparable = (block: ArticleBlock) => (block.rich ? normalizeBody(block.value) : block.value.trim());

export function changedBlocks(original: ArticleDraft, current: ArticleDraft): Array<{ before: ArticleBlock; after: ArticleBlock }> {
  const before = new Map(articleBlocks(original).map((block) => [block.id, block]));
  return articleBlocks(current).flatMap((after) => {
    const previous = before.get(after.id) || { ...after, value: "" };
    return comparable(previous) !== comparable(after) ? [{ before: previous, after }] : [];
  }).concat(articleBlocks(original).filter((block) => !articleBlocks(current).some((after) => after.id === block.id)).map((before) => ({ before, after: { ...before, value: "" } })));
}

export type ArticleCheck = { id: string; level: "ok" | "warning" | "error"; message: string };

export function articleChecks(draft: ArticleDraft, original: ArticleDraft, catalog: ArticleCatalog): ArticleCheck[] {
  const checks: ArticleCheck[] = [];
  const empty = articleBlocks(draft).filter((block) => !block.value.trim()).map((block) => block.label);
  checks.push(empty.length
    ? { id: "empty", level: "error", message: `Completá: ${empty.slice(0, 3).join(", ")}${empty.length > 3 ? "…" : ""}` }
    : { id: "empty", level: "ok", message: "Todos los bloques tienen texto" });

  const inherited = new Set(invalidMarkers(allText(original), catalog));
  const invalid = invalidMarkers(allText(draft), catalog);
  const added = invalid.filter((key) => !inherited.has(key));
  if (added.length) checks.push({ id: "invalid", level: "error", message: `${added.length} enlace(s) apuntan a algo que no está en el catálogo` });
  else if (invalid.length) checks.push({ id: "invalid", level: "warning", message: `${invalid.length} enlace(s) viejos no están en el catálogo y se verán como texto` });
  else checks.push({ id: "invalid", level: "ok", message: "Todos los enlaces existen en el catálogo" });

  const bodyMarkers = parseMarkers(draft.sections.map((section) => section.body).join("\n"));
  const storeLinks = bodyMarkers.filter((marker) => marker.kind === "p" || marker.kind === "c").length;
  checks.push(storeLinks >= 2
    ? { id: "store", level: "ok", message: `${storeLinks} enlaces a la tienda en el cuerpo` }
    : { id: "store", level: "warning", message: "Sumá al menos 2 enlaces a productos o categorías en el cuerpo" });
  if (catalog.guides.length) {
    const guideLinks = bodyMarkers.filter((marker) => marker.kind === "g").length;
    checks.push(guideLinks
      ? { id: "guides", level: "ok", message: `${guideLinks} enlace(s) a otras guías del blog` }
      : { id: "guides", level: "warning", message: "Enlazá al menos una guía relacionada del blog" });
  }

  const seoTitle = draft.seoTitle.trim().length;
  checks.push(seoTitle > ARTICLE_LIMITS.seoTitle
    ? { id: "seoTitle", level: "error", message: `El título SEO supera ${ARTICLE_LIMITS.seoTitle} caracteres` }
    : seoTitle < 30
      ? { id: "seoTitle", level: "warning", message: "El título SEO es muy corto (menos de 30 caracteres)" }
      : { id: "seoTitle", level: "ok", message: "Largo del título SEO correcto" });
  const description = draft.description.trim().length;
  checks.push(description > ARTICLE_LIMITS.description
    ? { id: "description", level: "error", message: `La descripción supera ${ARTICLE_LIMITS.description} caracteres` }
    : description < 70
      ? { id: "description", level: "warning", message: "La descripción es corta (menos de 70 caracteres)" }
      : { id: "description", level: "ok", message: "Largo de la descripción correcto" });
  return checks;
}

type Limited = { value: string; max: number; label: string };

function limitError(fields: Limited[]): string | null {
  for (const field of fields) {
    if (!field.value.trim()) return `Completá ${field.label.toLowerCase()}.`;
    if (field.value.trim().length > field.max) return `${field.label} supera ${field.max} caracteres.`;
  }
  return null;
}

/** Conserva el texto original si el cambio es solo de espacios o saltos. */
function keepOriginal(original: string, edited: string, rich: boolean): string {
  if (rich) return normalizeBody(original) === normalizeBody(edited) ? original : normalizeBody(edited);
  return original.trim() === edited.trim() ? original : edited.trim();
}

/** Superpone el borrador al contenido sin validar (vista previa). */
export function mergeDraft(content: Record<string, any>, draft: ArticleDraft): Record<string, any> {
  return {
    ...content,
    decision_support: draft.decision === undefined ? content.decision_support : draft.decision,
    source_refs: draft.sourceIds === undefined ? content.source_refs : (content.source_refs || []).filter((s: any) => draft.sourceIds!.includes(s.id)),
    keyword: draft.keyword,
    h1: draft.h1,
    titulo: draft.h1,
    seo_title: draft.seoTitle,
    meta_description: draft.description,
    hero_lede: draft.lede,
    direct_answer: draft.answer,
    sections: draft.sections.map((section) => ({ h2: section.h2, body: section.body })),
    faqs: draft.faqs.map((faq) => ({ q: faq.q, a: faq.a })),
    brand_solution: { ...(content.brand_solution && typeof content.brand_solution === "object" ? content.brand_solution : {}), title: draft.solutionTitle, body: draft.solutionBody },
  };
}

export type ApplyResult = { ok: true; content: Record<string, any>; draft: ArticleDraft } | { ok: false; error: string };

export function applyArticleDraft(content: Record<string, any>, input: ArticleDraft, catalog: ArticleCatalog, now = new Date()): ApplyResult {
  if (!input || !Array.isArray(input.sections) || !Array.isArray(input.faqs) || articleBlocksSafe(input) === false) return { ok: false, error: "Borrador inválido." };
  const original = draftFromContent(content);
  if (input.sections.length > 8 || input.faqs.length > 12) {
    return { ok: false, error: "El artículo admite hasta 8 secciones y 12 preguntas frecuentes." };
  }
  const L = ARTICLE_LIMITS;
  const error = limitError([
    { value: input.keyword, max: L.keyword, label: "La búsqueda objetivo" },
    { value: input.h1, max: L.h1, label: "El título" },
    { value: input.seoTitle, max: L.seoTitle, label: "El título SEO" },
    { value: input.description, max: L.description, label: "La descripción SEO" },
    { value: input.lede, max: L.lede, label: "La bajada" },
    { value: input.answer, max: L.answer, label: "La respuesta directa" },
    ...input.sections.flatMap((section, index) => [
      { value: section.h2, max: L.h2, label: `El subtítulo de la sección ${index + 1}` },
      { value: section.body, max: L.body, label: `El texto de la sección ${index + 1}` },
    ]),
    { value: input.solutionTitle, max: L.solutionTitle, label: "El título del cierre" },
    { value: input.solutionBody, max: L.solutionBody, label: "El texto del cierre" },
    ...input.faqs.flatMap((faq, index) => [
      { value: faq.q, max: L.q, label: `La pregunta ${index + 1}` },
      { value: faq.a, max: L.a, label: `La respuesta ${index + 1}` },
    ]),
  ]);
  if (error) return { ok: false, error };

  const draft: ArticleDraft = {
    keyword: keepOriginal(original.keyword, input.keyword, false),
    h1: keepOriginal(original.h1, input.h1, false),
    seoTitle: keepOriginal(original.seoTitle, input.seoTitle, false),
    description: keepOriginal(original.description, input.description, false),
    lede: keepOriginal(original.lede, input.lede, false),
    answer: keepOriginal(original.answer, input.answer, true),
    sections: input.sections.map((section, index) => ({
      h2: keepOriginal(original.sections[index]?.h2 || "", section.h2, false),
      body: keepOriginal(original.sections[index]?.body || "", section.body, true),
    })),
    faqs: input.faqs.map((faq, index) => ({ q: keepOriginal(original.faqs[index]?.q || "", faq.q, false), a: keepOriginal(original.faqs[index]?.a || "", faq.a, false) })),
    solutionTitle: keepOriginal(original.solutionTitle, input.solutionTitle, false),
    solutionBody: keepOriginal(original.solutionBody, input.solutionBody, true),
    sourceIds: input.sourceIds ?? original.sourceIds,
    decision: input.decision === undefined ? original.decision : input.decision,
  };

  // Las referencias heredadas que ya no existen se toleran (se ven como texto);
  // una referencia nueva fuera del catálogo se rechaza.
  const inherited = new Set(invalidMarkers(allText(original), catalog));
  const added = invalidMarkers(allText(draft), catalog).filter((key) => !inherited.has(key));
  if (added.length) return { ok: false, error: `Estos enlaces no están en el catálogo: ${added.join(", ")}` };

  return { ok: true, draft, content: { ...mergeDraft(content, draft), updated_at: now.toISOString() } };
}

function articleBlocksSafe(input: ArticleDraft): boolean {
  if ([input.keyword, input.h1, input.seoTitle, input.description, input.lede, input.answer, input.solutionTitle, input.solutionBody].some((v) => typeof v !== "string")) return false;
  if (input.sections.some((s) => !s || typeof s.h2 !== "string" || typeof s.body !== "string") || input.faqs.some((f) => !f || typeof f.q !== "string" || typeof f.a !== "string")) return false;
  if (input.sourceIds !== undefined && (!Array.isArray(input.sourceIds) || input.sourceIds.length > 100 || input.sourceIds.some((id) => typeof id !== "string"))) return false;
  if (input.decision && (!Array.isArray(input.decision.criteria) || input.decision.criteria.some((c) => typeof c !== "string") || typeof input.decision.recommendation !== "string" || !Array.isArray(input.decision.options) || input.decision.options.some((o) => !o || [o.product_id, o.suitable_for, o.advantages, o.limitations].some((v) => typeof v !== "string") || !Array.isArray(o.evidence_ids) || o.evidence_ids.some((id) => typeof id !== "string")))) return false;
  return JSON.stringify(input).length < 100000;
}

import { describe, expect, it } from "vitest";
import { analysisWeek, DEFAULT_MARKET, freshOpportunities, monthAfter, patchProfile, type BusinessProfileData, type ContentOpportunity } from "./business-analysis";
import { defaultDraft, sanitizeDraft } from "./onboarding";
import { mergeAnalyzedProfile, mergeUserBusinessDraft } from "./business-analysis-service";
import { inspectPageSeo } from "./business-seo";

const profile = (): BusinessProfileData => ({ draft: defaultDraft("Mi negocio"), market: DEFAULT_MARKET, priorities: [], exclusions: [], differentiators: [], manualFields: [] });
const topic = (keyword: string, title = keyword): ContentOpportunity => ({ keyword, title, category: "Accesorios", reason: "Resolver una consulta", sourceUrls: [], interpretation: true });

describe("perfil y planificación del negocio", () => {
  it("reserva siete días consecutivos desde la fecha local, cruzando mes y año", () => {
    expect(analysisWeek(new Date("2027-01-01T01:00:00Z"))).toEqual(["2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05", "2027-01-06"]);
  });
  it("ajusta el mes al último día y conserva la hora local", () => {
    expect(monthAfter(new Date("2027-01-31T15:45:00Z")).toISOString()).toBe("2027-02-28T15:45:00.000Z");
    expect(monthAfter(new Date("2027-01-31T01:00:00Z")).toISOString()).toBe("2027-03-01T01:00:00.000Z");
    expect(monthAfter(new Date("2028-01-31T15:00:00Z")).toISOString()).toBe("2028-02-29T15:00:00.000Z");
  });
  it("deduplica temas anteriores y rechaza exclusiones en título o categoría", () => {
    expect(freshOpportunities([topic("Cómo elegir auriculares"), topic("guía de pads", "Pads con envíos internacionales"), topic("tratamiento acústico casero")], ["como elegir auriculares"], ["envíos internacionales"])).toEqual([topic("tratamiento acústico casero")]);
  });
  it("protege correcciones y exclusiones al incorporar un nuevo análisis", () => {
    const edited = patchProfile(profile(), { description: "Descripción corregida", priorities: ["Servicios", "Productos"], exclusions: ["reventa"], differentiators: ["Asesoramiento personalizado"] });
    const next = mergeAnalyzedProfile(sanitizeDraft({ description: "Texto nuevo", differentiators: ["Sugerencia"] }), edited);
    expect(next.draft.description).toBe("Descripción corregida");
    expect(next.priorities).toEqual(["Servicios", "Productos"]);
    expect(next.draft.exclusions).toEqual(["reventa"]);
    expect(next.differentiators).toEqual(["Asesoramiento personalizado"]);
    expect(next.draft.manualFields).toContain("priorities");
  });
  it("mantiene compatibilidad de borradores antiguos", () => {
    expect(sanitizeDraft({ description: "Negocio existente" }).market).toEqual(DEFAULT_MARKET);
  });
  it("admite una nueva corrección humana de un campo ya protegido", () => {
    const previous = patchProfile(profile(), { description: "Anterior", offer: "Oferta protegida" });
    const changed = sanitizeDraft({ description: "Nueva corrección", offer: "Valor de una pestaña vieja", manualFields: ["description"] });
    const result = mergeUserBusinessDraft(changed, previous, ["description"]);
    expect(result.description).toBe("Nueva corrección"); expect(result.offer).toBe("Oferta protegida");
  });
  it("conserva una oferta que no apareció en la nueva muestra sin afirmar que dejó de venderse", () => {
    const previous = profile(); previous.draft = sanitizeDraft({ offerings: [{ id: "known", name: "Clases", kind: "service", selected: true, evidence: { url: "https://example.com/clases", status: "extracted", confidence: "high" } }] });
    const result = mergeAnalyzedProfile(defaultDraft("Mi negocio"), previous);
    expect(result.draft.offerings[0]).toMatchObject({ id: "known", selected: true, evidence: { status: "needs_confirmation" } });
  });
});

describe("SEO observable", () => {
  it("conserva evidencia y detecta JSON-LD incluso antes de quitar scripts", () => {
    const seo = inspectPageSeo('<title>Clases de piano</title><meta name="robots" content="noindex"><h1>Clases</h1><h1>Reserva</h1><script type="application/ld+json">{"@graph":[{"@type":"Service"}]}</script>', "https://ejemplo.com/clases");
    expect(seo.structuredTypes).toEqual(["Service"]);
    expect(seo.findings).toEqual(expect.arrayContaining([expect.objectContaining({ field: "h1", evidence: "2 encabezados H1" }), expect.objectContaining({ field: "robots", evidence: "noindex", severity: "info" })]));
    expect(seo.findings.every(f => !!f.recommendation)).toBe(true);
  });
  it("resuelve canonical relativa y marca datos estructurados inválidos", () => {
    const seo = inspectPageSeo('<link rel="canonical" href="/productos"><script type="application/ld+json">{</script>', "https://ejemplo.com/productos?filtro=1");
    expect(seo.canonical).toBe("https://ejemplo.com/productos");
    expect(seo.malformedStructuredData).toBe(true);
  });
});

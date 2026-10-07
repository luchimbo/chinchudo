import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ completion: vi.fn(), inspect: vi.fn(), complete: vi.fn(), config: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" } }));
vi.mock("./llm-provider", () => ({ resolveLLMConfig: () => mocks.config, fetchChatCompletion: mocks.completion }));
vi.mock("./blog-evidence", () => ({ inspectBlogArticle: mocks.inspect }));
vi.mock("./complete-blog-article", () => ({ completeBlogArticle: mocks.complete }));
import { generatePrivateBusinessArticle } from "./business-article-generator";
import { discoverContentOpportunities } from "./business-analysis-worker";
import { DEFAULT_MARKET, type BusinessProfileData } from "./business-analysis";
import { defaultDraft } from "./onboarding";
const client = { id: "a", name: "Clases Norte" } as any;
const profile: BusinessProfileData = { draft: defaultDraft(client.name), market: DEFAULT_MARKET, priorities: ["Clases"], exclusions: [], differentiators: [], manualFields: [] };
const topic = { keyword: "cómo preparar la primera clase de piano", title: "Prepará tu primera clase", category: "Clases", reason: "Orientación inicial", sourceUrls: ["https://clases.example/servicios"], interpretation: true as const };
const generated = { h1: topic.title, seo_title: topic.title, meta_description: "Consejos para preparar la primera clase de piano.", direct_answer: "Antes de la primera clase conviene conversar sobre tus objetivos y tu experiencia para definir una práctica adecuada.", sections: Array.from({ length: 4 }, (_, i) => ({ h2: `Consejo ${i}`, body: "La preparación de la clase incluye definir una meta y conocer las condiciones del lugar donde vas a practicar." })), faqs: Array.from({ length: 3 }, (_, i) => ({ q: `Pregunta ${i}`, a: "La respuesta depende de la experiencia y los objetivos de la persona." })), brand_solution: { title: "Conocé la propuesta", body: "Consultá las clases disponibles." } };
function database() {
  const slot = { id: "s", clientId: "a", analysisRunId: "run", requiresApproval: true, landingId: null, status: "PLANNED", scheduledDate: new Date("2026-10-05T00:00:00Z") };
  const db: any = {
    blogPublication: { findFirstOrThrow: vi.fn(async ({ where }: any) => { if (where.clientId !== slot.clientId) throw new Error("No encontrado"); return slot; }), update: vi.fn(async ({ data }: any) => Object.assign(slot, data)) },
    landingCategory: { findMany: vi.fn(async () => []) }, landingProduct: { findMany: vi.fn(async () => []) },
    contentCluster: { upsert: vi.fn(async ({ create }: any) => ({ id: "cluster", ...create })) },
    landing: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => ({ id: "article", ...data })) },
    businessAnalysisRun: { findFirst: vi.fn(async () => ({ id: "run" })) },
    $queryRaw: vi.fn(async () => [slot]),
  };
  db.$transaction = async (callback: any) => callback(db);
  return { db, slot };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.completion.mockResolvedValue({ response: { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(generated) } }] }) } });
  mocks.inspect.mockResolvedValue({ publishable: true, checks: [] });
  mocks.complete.mockImplementation(async (_db, _clientId, content) => ({ content, changes: [] }));
});
describe("generación privada del análisis", () => {
  it("propone temas sin enviar diagnósticos SEO y conserva el filtro de fuentes", async () => {
    mocks.completion.mockResolvedValue({ response: { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ opportunities: [{ ...topic, sourceUrls: [...topic.sourceUrls, "https://invented.example"] }] }) } }] }) } });
    const page = { url: topic.sourceUrls[0], title: "Clases de piano", pageType: "service", fetchedAt: "2026-10-06", seo: { h2: ["diagnóstico extenso"], findings: [{ evidence: "detalle técnico" }] } };
    const opportunities = await discoverContentOpportunities(client, profile, { own: { domain: "clases.example", description: "Clases", offer: "Piano", audience: "Alumnos", categories: ["Clases"], topics: [], pages: [page] } } as any);
    const payload = mocks.completion.mock.calls[0][1];
    const input = JSON.parse(payload.messages[1].content);
    expect(input.own.pages).toEqual([{ url: page.url, title: page.title, pageType: page.pageType }]);
    expect(payload.max_tokens).toBe(3000);
    expect(payload.response_format).toEqual({ type: "json_object" });
    expect(payload.reasoning).toEqual({ enabled: false });
    expect(opportunities[0].sourceUrls).toEqual(topic.sourceUrls);
    expect(page.seo.findings).toHaveLength(1);
  });
  it("guarda DRAFT sin URLs públicas y mantiene la aprobación incluso con autoPublish", async () => {
    const { db, slot } = database();
    await generatePrivateBusinessArticle(db, { ...client, autoPublish: true }, profile, topic, slot.id);
    const data = db.landing.create.mock.calls[0][0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.publicPreviewUrl).toBeUndefined();
    expect(data.previewPublishedAt).toBeUndefined();
    expect(data.publishedAt).toBeUndefined();
    expect(data.contentClusterId).toBe("cluster");
    expect(JSON.parse(data.htmlContent)).toMatchObject({ generation_mode: "private-draft", analysis_run_id: "run", hero_lede: generated.direct_answer, cluster_slug: "guias", cluster_name: "Guías" });
    expect(slot).toMatchObject({ requiresApproval: true, approvedAt: null, status: "READY", landingId: "article" });
    await generatePrivateBusinessArticle(db, client, profile, topic, slot.id);
    expect(db.landing.create).toHaveBeenCalledTimes(1);
  });
  it("completa enlaces y fuentes antes de revisar y persistir la respuesta de IA", async () => {
    const { db, slot } = database();
    mocks.complete.mockImplementation(async (_db, _clientId, content) => ({ content: { ...content, seo_title: "Primera clase de piano", sections: [{ h2: "Preparación", body: "Consultá [[c:clases|las clases]]." }], source_refs: [{ id: "catalog-clases" }] }, changes: ["catalog-link"] }));
    await generatePrivateBusinessArticle(db, client, profile, topic, slot.id);
    expect(mocks.complete).toHaveBeenCalledWith(db, client.id, expect.objectContaining({ source_refs: [], research_source_urls: topic.sourceUrls }));
    expect(mocks.inspect.mock.calls[0][2].sections[0].body).toContain("[[c:clases");
    const saved = db.landing.create.mock.calls[0][0].data;
    expect(saved.seoTitle).toBe("Primera clase de piano");
    expect(JSON.parse(saved.htmlContent).source_refs).toEqual([{ id: "catalog-clases" }]);
  });
  it("rechaza una reserva de otro cliente antes de invocar IA", async () => {
    const { db } = database();
    await expect(generatePrivateBusinessArticle(db, { ...client, id: "b" }, profile, topic, "s")).rejects.toThrow();
    expect(mocks.completion).not.toHaveBeenCalled();
  });
  it("descarta el resultado de un worker que perdió su lease", async () => {
    const { db } = database(); db.businessAnalysisRun.findFirst.mockResolvedValue(null);
    await expect(generatePrivateBusinessArticle(db, client, profile, topic, "s", undefined, "old-token")).rejects.toThrow("otro worker");
    expect(db.landing.create).not.toHaveBeenCalled();
  });
  it("un fallo de IA no crea un artículo ni modifica la reserva", async () => {
    const { db, slot } = database(); mocks.completion.mockRejectedValue(new Error("Proveedor caído"));
    await expect(generatePrivateBusinessArticle(db, client, profile, topic, "s")).rejects.toThrow("Proveedor caído");
    expect(db.landing.create).not.toHaveBeenCalled(); expect(slot.status).toBe("PLANNED");
  });
  it("rechaza una salida truncada sin persistir un artículo ni levantar la revisión", async () => {
    const { db, slot } = database();
    mocks.completion.mockResolvedValue({ response: { ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: '{"sections":[{}' } }] }) } });
    await expect(generatePrivateBusinessArticle(db, client, profile, topic, slot.id)).rejects.toThrow("límite de salida");
    expect(db.landing.create).not.toHaveBeenCalled();
    expect(slot).toMatchObject({ requiresApproval: true, landingId: null, status: "PLANNED" });
  });
});

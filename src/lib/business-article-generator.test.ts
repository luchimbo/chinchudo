import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ completion: vi.fn(), inspect: vi.fn() }));
vi.mock("./llm-provider", () => ({ resolveLLMConfig: () => ({}), fetchChatCompletion: mocks.completion }));
vi.mock("./blog-evidence", () => ({ inspectBlogArticle: mocks.inspect }));
import { generatePrivateBusinessArticle } from "./business-article-generator";
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
});
describe("generación privada del análisis", () => {
  it("guarda DRAFT sin URLs públicas y mantiene la aprobación incluso con autoPublish", async () => {
    const { db, slot } = database();
    await generatePrivateBusinessArticle(db, { ...client, autoPublish: true }, profile, topic, slot.id);
    const data = db.landing.create.mock.calls[0][0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.publicPreviewUrl).toBeUndefined();
    expect(data.previewPublishedAt).toBeUndefined();
    expect(data.publishedAt).toBeUndefined();
    expect(JSON.parse(data.htmlContent)).toMatchObject({ generation_mode: "private-draft", analysis_run_id: "run" });
    expect(slot).toMatchObject({ requiresApproval: true, approvedAt: null, status: "READY", landingId: "article" });
    await generatePrivateBusinessArticle(db, client, profile, topic, slot.id);
    expect(db.landing.create).toHaveBeenCalledTimes(1);
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
});

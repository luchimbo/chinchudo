import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ analyze: vi.fn(), sync: vi.fn(), syncCatalog: vi.fn() }));
vi.mock("./onboarding", async importOriginal => ({ ...await importOriginal<typeof import("./onboarding")>(),
  analyzePublicWebsite: mocks.analyze, syncOnboarding: mocks.sync, syncOnboardingCatalog: mocks.syncCatalog,
}));
import { defaultDraft, sanitizeDraft, type WebsiteAnalysis } from "./onboarding";
import { DEFAULT_MARKET } from "./business-analysis";
import { analyzeRequestedCatalog, mergeAnalyzedProfile, mergeCatalogBatch, saveBasicAnalysis } from "./business-analysis-service";

const item = (id: string, overrides = {}) => ({ id, kind: "product", name: `Producto ${id}`, category: "Muebles", url: `https://shop.example/productos/${id}`,
  selected: true, price: "Precio confirmado", availability: "Stock confirmado", evidence: { url: "https://shop.example", status: "extracted", confidence: "high" }, ...overrides });
function database() {
  const draft = sanitizeDraft({ ...defaultDraft("Negocio"), description: "Descripción corregida", offer: "Oferta corregida", manualFields: ["description", "offer"],
    offerings: [item("old")], stats: { catalogStatus: "deferred", catalogNextOffset: 0, products: 1 } });
  const profile = { id: "profile", clientId: "a", sourceUrl: "https://shop.example/", data: { draft, market: DEFAULT_MARKET, priorities: ["Muebles"], exclusions: [], differentiators: [], manualFields: [] } };
  const onboarding = { id: "onboarding", clientId: "a", sourceUrl: "https://shop.example/", status: "COMPLETED", draft };
  const db: any = {
    businessProfile: { findUnique: vi.fn(async () => profile), findUniqueOrThrow: vi.fn(async () => profile), update: vi.fn(async ({ data }) => { Object.assign(profile, data); return profile; }) },
    clientOnboarding: { findUnique: vi.fn(async () => onboarding), findUniqueOrThrow: vi.fn(async () => onboarding),
      update: vi.fn(async ({ data }) => { Object.assign(onboarding, data); return onboarding; }),
      upsert: vi.fn(async ({ update }) => { Object.assign(onboarding, update); return onboarding; }) },
    businessAnalysisRun: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }) => ({ ...data, status: "QUEUED" })), updateMany: vi.fn(async () => ({ count: 1 })), findUniqueOrThrow: vi.fn(async () => ({ id: "active" })) },
    $queryRaw: vi.fn(async () => []),
  };
  db.$transaction = vi.fn(async (callback: any) => callback(db));
  return { db, profile, onboarding, client: { id: "a", name: "Negocio" } as any };
}
function analysis(): WebsiteAnalysis {
  return { draft: sanitizeDraft({ name: "Negocio", description: "Descripción web", offer: "Categorías web", priorities: ["Categoría nueva"], stats: { catalogStatus: "deferred" } }), pages: [] };
}
beforeEach(() => { vi.clearAllMocks(); mocks.syncCatalog.mockResolvedValue({ products: 1, services: 0 }); });

describe("investigación básica y catálogo opcional", () => {
  it("guarda el perfil y siembra el checkpoint sin sincronizar el catálogo ni repetir la lectura", async () => {
    const { db, profile, onboarding, client } = database();
    const original = structuredClone(profile.data.draft.offerings);
    const result = await saveBasicAnalysis(db, client, analysis(), onboarding.sourceUrl, DEFAULT_MARKET);
    expect(result.draft.description).toBe("Descripción corregida");
    expect(result.draft.offer).toBe("Oferta corregida");
    expect(result.draft.offerings).toEqual(original);
    expect(onboarding.status).toBe("COMPLETED");
    expect(result.run).toMatchObject({ status: "QUEUED", stage: "competitors", checkpoint: { own: true } });
    expect(result.run.result).toMatchObject({ profileSnapshot: { draft: { analysisRunId: result.run.id } } });
    expect(mocks.sync).not.toHaveBeenCalled(); expect(mocks.syncCatalog).not.toHaveBeenCalled(); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("una lectura básica no degrada evidencia ni reinicia el progreso del catálogo existente", () => {
    const { profile } = database();
    profile.data.draft.stats.catalogStatus = "partial";
    profile.data.draft.stats.catalogNextOffset = 39;
    const next = mergeAnalyzedProfile(analysis().draft, profile.data);
    expect(next.draft.offerings).toEqual(profile.data.draft.offerings);
    expect(next.draft.stats).toMatchObject({ catalogStatus: "partial", catalogNextOffset: 39 });
  });
  it("no pisa una corrida que el worker tomó mientras se guardaba el resumen", async () => {
    const { db, client, onboarding } = database();
    db.businessAnalysisRun.findFirst.mockResolvedValue({ id: "active", sourceUrl: onboarding.sourceUrl, status: "QUEUED", stage: "website" });
    db.businessAnalysisRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveBasicAnalysis(db, client, analysis(), onboarding.sourceUrl)).rejects.toThrow("en curso");
    expect(db.businessAnalysisRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "active", status: "QUEUED", stage: "website" } }));
    expect(db.businessAnalysisRun.create).not.toHaveBeenCalled();
  });
  it("el catálogo combina lotes sin reemplazar texto, selecciones ni datos comerciales confirmados", () => {
    const { profile } = database();
    const current = profile.data.draft;
    current.offerings[0].selected = false;
    const batch = sanitizeDraft({ description: "No aplicar", offerings: [item("old", { price: "$1", availability: "Nuevo stock" }), item("new")], stats: { catalogStatus: "partial", catalogNextOffset: 39 } });
    const next = mergeCatalogBatch(current, batch);
    expect(next.description).toBe(current.description); expect(next.offer).toBe(current.offer);
    expect(next.offerings[0]).toMatchObject({ selected: false, price: "Precio confirmado", availability: "Stock confirmado" });
    expect(next.offerings).toHaveLength(2);
    expect(next.stats).toMatchObject({ catalogStatus: "partial", catalogNextOffset: 39 });
  });
  it("requiere activación antes de acceder a la web o importar productos", async () => {
    const { db, onboarding, client } = database(); onboarding.status = "IN_REVIEW";
    await expect(analyzeRequestedCatalog(db, client)).rejects.toThrow("Activá");
    expect(mocks.analyze).not.toHaveBeenCalled(); expect(mocks.syncCatalog).not.toHaveBeenCalled();
  });
  it("continúa el catálogo solicitado y solo persiste el lote observado", async () => {
    const { db, profile, onboarding, client } = database();
    const before = structuredClone(profile.data.draft);
    mocks.analyze.mockResolvedValue({ draft: sanitizeDraft({ offerings: [item("new")], stats: { catalogStatus: "partial", catalogNextOffset: 39, catalogSyncPending: true } }), pages: [] });
    const result = await analyzeRequestedCatalog(db, client);
    expect(mocks.analyze).toHaveBeenCalledWith(onboarding.sourceUrl, client.name, expect.objectContaining({ mode: "catalog", skipSuggestions: true, candidateOffset: 0 }));
    expect(mocks.syncCatalog.mock.calls[0][2].offerings.map((o: any) => o.id)).toEqual(["new"]);
    expect(mocks.syncCatalog.mock.calls[0][3]).toBe(true);
    expect(result.draft.description).toBe(before.description); expect(result.draft.manualFields).toEqual(before.manualFields);
    expect(profile.data.draft.description).toBe(before.description);
    expect(result.draft.stats).toMatchObject({ catalogStatus: "partial", catalogNextOffset: 39, importedProducts: 1 });
  });
  it("importa nuevos lotes aunque la muestra del borrador ya tenga 100 productos", async () => {
    const { db, profile, onboarding, client } = database();
    profile.data.draft.offerings = sanitizeDraft({ offerings: Array.from({ length: 100 }, (_, i) => item(String(i))) }).offerings;
    onboarding.draft = profile.data.draft;
    mocks.analyze.mockResolvedValue({ draft: sanitizeDraft({ offerings: [item("101")], stats: { catalogStatus: "complete", catalogNextOffset: 101 } }), pages: [] });
    await analyzeRequestedCatalog(db, client);
    expect(mocks.syncCatalog.mock.calls[0][2].offerings.map((o: any) => o.id)).toEqual(["101"]);
  });
  it("rechaza un lote si cambió la URL mientras se leía la web", async () => {
    const { db, onboarding, client } = database();
    db.clientOnboarding.findUniqueOrThrow.mockResolvedValue({ ...onboarding, sourceUrl: "https://other.example/" });
    mocks.analyze.mockResolvedValue({ draft: sanitizeDraft({}), pages: [] });
    await expect(analyzeRequestedCatalog(db, client)).rejects.toThrow("cambió");
    expect(mocks.syncCatalog).not.toHaveBeenCalled();
  });
  it("rechaza una segunda importación del mismo lote", async () => {
    const { db, onboarding, client } = database();
    db.clientOnboarding.findUniqueOrThrow.mockResolvedValue({ ...onboarding, draft: { ...onboarding.draft, stats: { catalogNextOffset: 39, catalogStatus: "partial" } } });
    mocks.analyze.mockResolvedValue({ draft: sanitizeDraft({ offerings: [item("new")] }), pages: [] });
    await expect(analyzeRequestedCatalog(db, client)).rejects.toThrow("cambió");
    expect(mocks.syncCatalog).not.toHaveBeenCalled();
  });
});

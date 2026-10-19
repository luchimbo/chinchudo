import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ owned: vi.fn(), analyze: vi.fn(), save: vi.fn(), catalog: vi.fn(), enqueue: vi.fn() }));
vi.mock("./db", () => ({ prisma: {} }));
vi.mock("./auth", () => ({ resolveClientForSlug: mocks.owned, ClientResolutionError: class extends Error { status = 403; } }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("./onboarding", async importOriginal => ({ ...await importOriginal<typeof import("./onboarding")>(), analyzePublicWebsite: mocks.analyze }));
vi.mock("./business-analysis-service", () => ({ saveBasicAnalysis: mocks.save, analyzeRequestedCatalog: mocks.catalog, enqueueBusinessAnalysis: mocks.enqueue, readBusinessProfile: vi.fn(), syncBusinessDraft: vi.fn() }));
import { POST } from "@/app/api/onboarding/route";
const request = (body: unknown) => new NextRequest("https://suite.example/api/onboarding?client=a", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.owned.mockResolvedValue({ id: "a", name: "Negocio" }); });

describe("API de investigación inicial", () => {
  it("responde con el resumen directamente y deja la cola para después", async () => {
    const draft = { name: "Negocio", description: "Oferta general" };
    mocks.analyze.mockResolvedValue({ draft, pages: [], warning: "Lectura parcial" });
    mocks.save.mockResolvedValue({ draft, run: { id: "run", status: "QUEUED", stage: "competitors", leaseToken: "private" } });
    const response = await POST(request({ action: "analyze", url: "https://shop.example/" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft, warning: "Lectura parcial", run: { id: "run", status: "QUEUED", stage: "competitors" } });
    expect(mocks.analyze).toHaveBeenCalledWith("https://shop.example/", expect.objectContaining({ name: "Negocio" }), expect.objectContaining({ mode: "basic", signal: expect.any(AbortSignal) }));
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it.each(["analyze", "analyzeCatalog"])("exige acceso al cliente antes de %s", async action => {
    mocks.owned.mockRejectedValue(new Error("Sin acceso"));
    const response = await POST(request({ action, url: "https://shop.example/" }));
    expect(response.status).toBe(401);
    expect(mocks.analyze).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("el catálogo opera solo sobre el cliente resuelto y su URL guardada", async () => {
    mocks.catalog.mockResolvedValue({ draft: { stats: { catalogStatus: "partial" } } });
    const response = await POST(request({ action: "analyzeCatalog", clientId: "other", url: "http://127.0.0.1" }));
    expect(response.status).toBe(200);
    expect(mocks.catalog).toHaveBeenCalledWith({}, expect.objectContaining({ id: "a" }), expect.any(AbortSignal));
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("valida el mercado antes de iniciar una lectura", async () => {
    expect((await POST(request({ action: "analyze", url: "https://shop.example/", market: { timezone: "Invalid/Timezone" } }))).status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("preserva el último perfil si la lectura inicial falla", async () => {
    mocks.analyze.mockRejectedValue(new Error("El sitio respondió 503."));
    const response = await POST(request({ action: "analyze", url: "https://shop.example/" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("503");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("no expone errores de persistencia aunque contengan textos del sitio", async () => {
    mocks.analyze.mockResolvedValue({ draft: {}, pages: [] });
    mocks.save.mockRejectedValue(new Error("Prisma error: private database info and productos de la web"));
    const response = await POST(request({ action: "analyze", url: "https://shop.example/" }));
    const body = await response.json();
    expect(body.error).toContain("Revisá tu conexión");
    expect(body.error).not.toContain("private");
  });
});

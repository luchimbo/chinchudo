import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ owned: vi.fn(), enqueue: vi.fn(), edit: vi.fn(), publicUrl: vi.fn(), db: { businessProfile: { findUnique: vi.fn() }, businessCompetitor: { findMany: vi.fn() }, businessAnalysisRun: { findMany: vi.fn(), findFirst: vi.fn() }, blogPublication: { findMany: vi.fn() } } }));
vi.mock("./db", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({ resolveClientForSlug: mocks.owned }));
vi.mock("./auth-guards", () => ({ toErrorResponse: (e: Error) => NextResponse.json({ error: e.message }, { status: 403 }) }));
vi.mock("./business-analysis-service", () => ({ enqueueBusinessAnalysis: mocks.enqueue, editBusinessProfile: mocks.edit, ensureBusinessProfile: vi.fn(), jsonData: (v: unknown) => v }));
vi.mock("./onboarding", () => ({ assertPublicUrl: mocks.publicUrl, normalizeWebsiteUrl: (v: string) => v }));
import { GET, POST, PATCH } from "@/app/api/business-analysis/route";
const request = (method: string, body?: unknown) => new NextRequest("https://suite.example/api/business-analysis?client=a", { method, ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => vi.resetAllMocks());
describe("API y aislamiento del análisis", () => {
  it.each([["GET", GET], ["POST", POST], ["PATCH", PATCH]] as const)("valida acceso antes de operar en %s", async (method, handler) => {
    mocks.owned.mockRejectedValue(new Error("Sin acceso"));
    expect((await handler(request(method, { sourceUrl: "https://shop.example" }))).status).toBe(403);
    expect(mocks.db.businessProfile.findUnique).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.edit).not.toHaveBeenCalled();
  });
  it("inicia sólo para el cliente autorizado y responde 202", async () => {
    const client = { id: "a" }; mocks.owned.mockResolvedValue(client); mocks.enqueue.mockResolvedValue({ id: "run", status: "QUEUED", stage: "website", leaseToken: "secret" });
    const response = await POST(request("POST", { sourceUrl: "https://shop.example" }));
    expect(response.status).toBe(202); expect(mocks.enqueue).toHaveBeenCalledWith(mocks.db, client, "https://shop.example", undefined);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("rechaza una corrida de otro cliente al reintentar", async () => {
    mocks.owned.mockResolvedValue({ id: "a" }); mocks.db.businessAnalysisRun.findFirst.mockResolvedValue(null);
    expect((await POST(request("POST", { action: "retry", runId: "other" }))).status).toBe(404);
    expect(mocks.db.businessAnalysisRun.findFirst).toHaveBeenCalledWith({ where: { id: "other", clientId: "a" } });
  });
  it("rechaza URL interna antes de encolar", async () => {
    mocks.owned.mockResolvedValue({ id: "a" }); mocks.publicUrl.mockRejectedValue(new Error("No se permiten direcciones internas."));
    expect((await POST(request("POST", { sourceUrl: "http://127.0.0.1" }))).status).toBe(400); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("consulta sólo datos del cliente y no expone el lease del worker", async () => {
    mocks.owned.mockResolvedValue({ id: "a" }); mocks.db.businessProfile.findUnique.mockResolvedValue(null); mocks.db.businessCompetitor.findMany.mockResolvedValue([]);
    mocks.db.businessAnalysisRun.findMany.mockResolvedValue([{ id: "run", status: "RUNNING", leaseToken: "secret", leaseExpiresAt: new Date() }]); mocks.db.blogPublication.findMany.mockResolvedValue([]);
    const response = await GET(request("GET")); expect(response.status).toBe(200);
    expect(mocks.db.businessCompetitor.findMany.mock.calls[0][0].where).toEqual({ clientId: "a" });
    expect(mocks.db.blogPublication.findMany.mock.calls[0][0].where).toEqual({ clientId: "a", analysisRunId: "run" });
    expect(JSON.stringify(await response.json())).not.toContain("leaseToken");
  });
});

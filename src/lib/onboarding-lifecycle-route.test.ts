import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ owned: vi.fn(), sync: vi.fn(), syncBusiness: vi.fn(), enqueue: vi.fn(), db: {
  clientOnboarding: { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  businessProfile: { findUnique: vi.fn(), update: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
} }));
vi.mock("./db", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({ resolveClientForSlug: mocks.owned, ClientResolutionError: class extends Error { status = 403; } }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("./onboarding", async importOriginal => ({ ...await importOriginal<typeof import("./onboarding")>(), syncOnboarding: mocks.sync }));
vi.mock("./business-analysis-service", () => ({
  transactionDatabase: (tx: unknown) => tx, jsonData: (value: unknown) => JSON.parse(JSON.stringify(value)),
  syncBusinessDraft: mocks.syncBusiness, enqueueBusinessAnalysis: mocks.enqueue, analyzeRequestedCatalog: vi.fn(), saveBasicAnalysis: vi.fn(), readBusinessProfile: vi.fn(),
}));
import { defaultDraft, sanitizeDraft } from "./onboarding";
import { POST, PATCH } from "@/app/api/onboarding/route";
const request = (body: unknown, method = "POST") => new NextRequest("https://suite.test/api/onboarding?client=a", { method, body: JSON.stringify(body) });
let row: any;
beforeEach(() => {
  vi.resetAllMocks();
  row = { id: "onboarding-a", clientId: "a", sourceUrl: "", status: "IN_REVIEW", currentStep: 2,
    draft: { ...defaultDraft("Negocio"), offer: "Clases de música" } };
  mocks.owned.mockResolvedValue({ id: "a", name: "Negocio", slug: "a" });
  mocks.db.$transaction.mockImplementation(async callback => callback(mocks.db));
  mocks.db.clientOnboarding.findUniqueOrThrow.mockImplementation(async () => row);
  mocks.db.clientOnboarding.upsert.mockImplementation(async () => row);
  mocks.db.clientOnboarding.update.mockImplementation(async ({ data }) => { Object.assign(row, data); return row; });
  mocks.db.businessProfile.findUnique.mockResolvedValue(null);
  mocks.sync.mockImplementation(async (_db, _client, draft) => { row.status = "COMPLETED"; row.draft = draft; });
  mocks.enqueue.mockResolvedValue({ id: "run" });
});

describe("guardado, activación y primera elección", () => {
  it("activa con lo mínimo y conserva los conocimientos como pendientes", async () => {
    row.draft.knowledge = ["Sugerencia de IA", "", ""];
    const response = await POST(request({ action: "complete" }));
    expect(response.status).toBe(200);
    expect((await response.json()).next).toBe("/bienvenida?client=a");
    expect(mocks.sync.mock.calls[0][2]).toMatchObject({ brand: "Negocio", description: "Clases de música", knowledgeApproved: false, welcomeCompleted: false });
    expect(mocks.syncBusiness.mock.calls[0][5]).toEqual({ applyContext: false });
  });
  it("no activa sin oferta ni modifica el estado guardado", async () => {
    row.draft.offer = "";
    const response = await POST(request({ action: "complete" }));
    expect(response.status).toBe(400);
    expect((await response.json()).issues.map((issue: any) => issue.key)).toEqual(["offer"]);
    expect(mocks.sync).not.toHaveBeenCalled(); expect(row.status).toBe("IN_REVIEW");
  });
  it("una cuenta antigua editada no vuelve al inicio guiado", async () => {
    row.status = "COMPLETED";
    expect((await (await POST(request({ action: "complete" }))).json()).next).toBe(null);
  });
  it("aprueba conocimientos únicamente con la confirmación explícita", async () => {
    row.status = "COMPLETED"; row.draft.knowledge = ["Revisado", "", ""];
    await POST(request({ action: "complete", knowledgeReviewed: true }));
    expect(mocks.sync.mock.calls[0][2].knowledgeApproved).toBe(true);
  });
  it("no muestra éxito de guardado si falla la escritura", async () => {
    mocks.db.clientOnboarding.update.mockRejectedValue(new Error("DB unavailable"));
    expect((await PATCH(request({ draft: row.draft, currentStep: 3 }, "PATCH"))).status).toBe(400);
  });
  it("ignora un autosave viejo que llegó después de uno nuevo", async () => {
    row.draft.__onboardingSave = { session: "tab-a", revision: 3 };
    const response = await PATCH(request({ saveSession: "tab-a", saveRevision: 2, draft: { offer: "Valor viejo" }, currentStep: 1 }, "PATCH"));
    expect(response.status).toBe(200);
    expect(row.draft.offer).toBe("Clases de música"); expect(row.currentStep).toBe(2);
    expect(mocks.db.clientOnboarding.update).not.toHaveBeenCalled();
  });
  it("el autosave no aprueba conocimientos ni descarta una bienvenida pendiente", async () => {
    row.status = "COMPLETED"; row.draft.welcomeCompleted = false;
    await PATCH(request({ draft: { knowledgeApproved: true, welcomeCompleted: true, firstUseGoal: "content" }, saveSession: "tab-a", saveRevision: 4 }, "PATCH"));
    expect(row.draft).toMatchObject({ knowledgeApproved: false, welcomeCompleted: false, firstUseGoal: "", __onboardingSave: { session: "tab-a", revision: 4 } });
    expect(row.status).toBe("COMPLETED");
  });
  it.each([["opportunities", "/radar"], ["content", "/blog"], ["responses", "/asistente-cm"], ["", "/"]] as const)("guarda la elección %s antes de navegar", async (goal, destination) => {
    row.status = "COMPLETED"; row.draft.welcomeCompleted = false;
    const response = await POST(request({ action: "welcome", goal, clientId: "another-client" }));
    expect(response.status).toBe(200);
    expect(row.draft).toMatchObject({ welcomeCompleted: true, firstUseGoal: goal });
    const next = new URL((await response.json()).next, "https://suite.test");
    expect(next.pathname).toBe(destination); expect(next.searchParams.get("client")).toBe("a");
  });
  it("no permite elegir una herramienta antes de terminar la configuración", async () => {
    expect((await POST(request({ action: "welcome", goal: "content" }))).status).toBe(400);
    expect(mocks.db.clientOnboarding.update).not.toHaveBeenCalled();
  });
  it.each(["complete", "welcome"])("exige acceso al cliente para %s", async action => {
    mocks.owned.mockRejectedValue(new Error("Sin acceso"));
    expect((await POST(request({ action, goal: "content" }))).status).toBe(401);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("al cambiar conocimientos aprobados, los deja pendientes de nueva revisión", async () => {
    row.draft = sanitizeDraft({ ...row.draft, knowledge: ["Anterior"], knowledgeApproved: true });
    await PATCH(request({ draft: { knowledge: ["Cambio sin revisar"] } }, "PATCH"));
    expect(row.draft.knowledgeApproved).toBe(false);
  });
});

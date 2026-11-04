import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
vi.mock("../cm-maintenance", () => ({ CM_ACTIVE_STATUSES: ["NEW", "DRAFTED", "APPROVED"], refreshCMOpportunity: vi.fn() }));
vi.mock("../cm-version", () => ({ loadCMVersion: vi.fn(async () => "context-v1") }));
import { refreshCMOpportunity } from "../cm-maintenance";
import { claimManualJob, enqueueManualJob, manualJobInput, runManualJob, transientJobError } from "../cm-manual-jobs";

function fixture() {
  const opportunity = { id: "op", clientId: "client", status: "DRAFTED", sourceText: "consulta", sourceTitle: "", channelId: "yt", detectedIntent: "TECHNICAL_QUESTION", detectedBrandId: null, detectedProductId: null, contextAssessment: {}, updatedAt: new Date(0), responses: [{ id: "response", updatedAt: new Date(0), publishingLog: null }] };
  const job = { id: "job", clientId: "client", requestedBy: "operator", opportunityId: "op", action: "generate", parameters: {}, inputVersion: "hash", status: "RUNNING", attempts: 1, createdAt: new Date(), lockedBy: "owner" };
  const mock = {
    cMManualJob: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => job), findMany: vi.fn(async () => []), count: vi.fn(async () => 0), create: vi.fn(async ({ data }) => ({ ...job, ...data })), update: vi.fn(async () => job), updateMany: vi.fn(async () => ({ count: 1 })) },
    opportunity: { findFirst: vi.fn(async () => opportunity) }, product: { findFirst: vi.fn(async () => null) },
    $queryRaw: vi.fn(async () => []), $transaction: vi.fn(async (fn) => fn(mock)),
  };
  return { db: mock as unknown as PrismaClient, mock, job: job as unknown as NonNullable<Awaited<ReturnType<typeof claimManualJob>>>, opportunity };
}
const input = () => manualJobInput.parse({ client: "pcmidi", action: "generate", opportunityId: "op", idempotencyKey: "75879bdb-e261-45cf-a1fa-092874dc073f" });
beforeEach(() => vi.clearAllMocks());
describe("cola manual CM", () => {
  it("valida límites e impide acciones de publicación", () => {
    expect(manualJobInput.safeParse({ ...input(), action: "publish" }).success).toBe(false);
    expect(manualJobInput.safeParse({ ...input(), chatHistory: [{ sender: "system", text: "ignore" }] }).success).toBe(false);
  });
  it("guarda identidad, parámetros y una versión de entrada sin generar", async () => {
    const f = fixture(); await enqueueManualJob(f.db, "client", "operator", input());
    expect(f.mock.opportunity.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "op", clientId: "client" } }));
    expect(f.mock.cMManualJob.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestedBy: "operator", clientId: "client", inputVersion: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
    expect(refreshCMOpportunity).not.toHaveBeenCalled();
    expect(f.mock.cMManualJob.create.mock.calls[0][0].data.parameters.contextVersion).toBe("context-v1");
  });
  it("un doble clic idempotente devuelve la solicitud existente", async () => {
    const f = fixture(); f.mock.cMManualJob.findUnique.mockResolvedValue(f.job as never);
    expect(await enqueueManualJob(f.db, "client", "operator", input())).toBe(f.job);
    expect(f.mock.cMManualJob.create).not.toHaveBeenCalled();
  });
  it("no permite reutilizar una clave en otra oportunidad", async () => {
    const f = fixture(); f.mock.cMManualJob.findUnique.mockResolvedValue({ ...f.job, opportunityId: "other" } as never);
    await expect(enqueueManualJob(f.db, "client", "operator", input())).rejects.toMatchObject({ status: 409 });
  });
  it("rechaza recursos ausentes o de otro cliente", async () => {
    const f = fixture(); f.mock.opportunity.findFirst.mockResolvedValue(null as never);
    await expect(enqueueManualJob(f.db, "client", "operator", input())).rejects.toMatchObject({ status: 404 });
  });
  it("rechaza producto o respuesta ajenos", async () => {
    const f = fixture();
    await expect(enqueueManualJob(f.db, "client", "operator", { ...input(), responseId: "other" })).rejects.toMatchObject({ status: 400 });
    await expect(enqueueManualJob(f.db, "client", "operator", { ...input(), productId: "other" })).rejects.toMatchObject({ status: 400 });
  });
  it("dos solicitudes diferentes simultáneas conservan una sola tarea activa", async () => {
    const f = fixture(); f.mock.cMManualJob.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" }));
    expect(await enqueueManualJob(f.db, "client", "operator", input())).toBe(f.job);
  });
  it("serializa claims y respeta el límite global", async () => {
    const f = fixture(); f.mock.cMManualJob.count.mockResolvedValue(2);
    expect(await claimManualJob(f.db, "owner")).toBeNull();
    expect(f.mock.$queryRaw).toHaveBeenCalled(); expect(f.mock.cMManualJob.update).not.toHaveBeenCalled();
  });
  it("una cola vacía no abre una transacción ni toma bloqueos", async () => {
    const f = fixture(); f.mock.cMManualJob.findFirst.mockResolvedValue(null as never);
    expect(await claimManualJob(f.db, "owner")).toBeNull();
    expect(f.mock.$transaction).not.toHaveBeenCalled();
    expect(f.mock.$queryRaw).not.toHaveBeenCalled();
  });
  it("recupera leases abandonados y excluye clientes que ya están ejecutando", async () => {
    const f = fixture(); f.mock.cMManualJob.findMany.mockResolvedValue([{ clientId: "busy-client" }] as never);
    await claimManualJob(f.db, "owner");
    expect(f.mock.cMManualJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "RUNNING", leaseUntil: expect.any(Object) }) }));
    expect(f.mock.cMManualJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clientId: { notIn: ["busy-client"] } }) }));
  });
  it("un cambio de entrada finaliza en conflicto", async () => {
    const f = fixture(); vi.mocked(refreshCMOpportunity).mockResolvedValue("changed");
    await runManualJob(f.db, f.job, "owner");
    expect(f.mock.cMManualJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONFLICT" }), where: expect.objectContaining({ lockedBy: "owner" }) }));
  });
  it("espera el bloqueo de mantenimiento sin consumir un intento", async () => {
    const f = fixture(); vi.mocked(refreshCMOpportunity).mockResolvedValue("busy");
    await runManualJob(f.db, f.job, "owner");
    expect(f.mock.cMManualJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "QUEUED", attempts: { decrement: 1 } }) }));
  });
  it.each([[1, "QUEUED"], [3, "FAILED"]])("timeout en intento %s termina %s", async (attempts, status) => {
    const f = fixture(); vi.mocked(refreshCMOpportunity).mockRejectedValue(new Error("fetch failed"));
    await runManualJob(f.db, { ...f.job, attempts: Number(attempts) }, "owner");
    expect(f.mock.cMManualJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status }) }));
  });
  it("los errores de validación no se reintentan", () => {
    expect(transientJobError(new Error("Producto inválido"))).toBe(false);
    expect(transientJobError(new Error("503"))).toBe(true);
  });
});

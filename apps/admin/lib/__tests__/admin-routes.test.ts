import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: { $transaction: vi.fn(), client: { findUnique: vi.fn() }, supportSession: { count: vi.fn() } } }));
vi.mock("@/lib/admin-auth", () => ({ requirePlatformAdmin: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
import { PATCH } from "../../app/api/issue-reports/[id]/route";
import { POST } from "../../app/api/support-sessions/route";

const tx = { issueReport: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() }, adminAuditEvent: { create: vi.fn() }, supportSession: { create: vi.fn() } };
const reportRequest = (body = '{"status":"RESOLVED"}', origin = "https://admin.example") => new NextRequest("https://admin.example/api/issue-reports/r1", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ profile: { id: "admin" } });
  mocks.db.$transaction.mockImplementation(callback => callback(tx));
  mocks.db.client.findUnique.mockResolvedValue({ id: "a", active: true });
  mocks.db.supportSession.count.mockResolvedValue(0);
  tx.issueReport.findUniqueOrThrow.mockResolvedValue({ status: "OPEN" });
  tx.issueReport.updateMany.mockResolvedValue({ count: 1 });
  tx.supportSession.create.mockResolvedValue({ id: "s1", expiresAt: new Date() });
  vi.stubEnv("SUPPORT_EXCHANGE_PEPPER", "test-pepper");
});
describe("reportes administrativos", () => {
  it("rechaza usuarios sin sesión antes de acceder a la base", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await PATCH(reportRequest(), { params: { id: "r1" } })).status).toBe(401);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("rechaza origen ajeno, estados desconocidos y JSON inválido", async () => {
    expect((await PATCH(reportRequest(undefined, "https://other.example"), { params: { id: "r1" } })).status).toBe(403);
    expect((await PATCH(reportRequest('{"status":"DELETED"}'), { params: { id: "r1" } })).status).toBe(400);
    expect((await PATCH(reportRequest("{"), { params: { id: "r1" } })).status).toBe(400);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("resuelve y audita dentro de la misma transacción", async () => {
    expect((await PATCH(reportRequest(), { params: { id: "r1" } })).status).toBe(200);
    expect(tx.issueReport.updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: expect.any(Date) } });
    expect(tx.adminAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: "admin", action: "issue_report.resolved", targetId: "r1" }) });
  });
  it("reabre quitando la fecha de resolución y no duplica acciones ya aplicadas", async () => {
    tx.issueReport.findUniqueOrThrow.mockResolvedValue({ status: "RESOLVED" });
    await PATCH(reportRequest('{"status":"OPEN"}'), { params: { id: "r1" } });
    expect(tx.issueReport.updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "RESOLVED" }, data: { status: "OPEN", resolvedAt: null } });
    tx.issueReport.updateMany.mockClear(); tx.adminAuditEvent.create.mockClear();
    await PATCH(reportRequest(), { params: { id: "r1" } });
    expect(tx.issueReport.updateMany).not.toHaveBeenCalled();
    expect(tx.adminAuditEvent.create).not.toHaveBeenCalled();
  });
  it("no agrega una auditoría si otro pedido ya aplicó el cambio", async () => {
    tx.issueReport.updateMany.mockResolvedValue({ count: 0 });
    expect((await PATCH(reportRequest(), { params: { id: "r1" } })).status).toBe(200);
    expect(tx.adminAuditEvent.create).not.toHaveBeenCalled();
  });
  it("devuelve 404 si el reporte no existe", async () => {
    tx.issueReport.findUniqueOrThrow.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "5.22.0" }));
    expect((await PATCH(reportRequest(), { params: { id: "missing" } })).status).toBe(404);
  });
});
describe("acceso de soporte a módulos", () => {
  const request = (targetPath: string) => new NextRequest("https://admin.example/api/support-sessions", { method: "POST", body: JSON.stringify({ clientId: "a", targetPath }) });
  it("liga el destino permitido al código y deja registro auditado", async () => {
    expect((await POST(request("/blog/calendario"))).status).toBe(201);
    expect(tx.supportSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clientId: "a", metadata: { targetPath: "/blog/calendario" } }) });
    expect(tx.adminAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ metadata: expect.objectContaining({ targetPath: "/blog/calendario" }) }) });
  });
  it("rechaza destinos externos o rutas fuera de los módulos", async () => {
    for (const path of ["https://other.example", "//other.example", "/api/auth/logout", "/blog?client=other"]) expect((await POST(request(path))).status).toBe(400);
    expect(tx.supportSession.create).not.toHaveBeenCalled();
  });
  it("no genera accesos sin administrador o para clientes suspendidos", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request("/blog"))).status).toBe(401);
    mocks.auth.mockResolvedValue({ profile: { id: "admin" } }); mocks.db.client.findUnique.mockResolvedValue({ id: "a", active: false });
    expect((await POST(request("/blog"))).status).toBe(404);
    expect(tx.supportSession.create).not.toHaveBeenCalled();
  });
});

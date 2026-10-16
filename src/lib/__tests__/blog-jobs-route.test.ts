import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { blogPublication: { findMany: mocks.rows } } }));
vi.mock("@/lib/auth", async original => ({ ...await original<typeof import("@/lib/auth")>(), resolveClientForSlug: mocks.client }));
import { GET } from "@/app/api/blog/jobs/route";
import { ClientResolutionError } from "@/lib/auth";
const row = { id: "job", status: "PLANNED", lastError: "", errorCode: "", needsDeploy: false, preparation: { phase: "REVIEWING" }, plannedTitle: "Artículo", scheduledDate: new Date("2026-11-01"), updatedAt: new Date(), landingId: null, requiresApproval: false, landing: null };
beforeEach(() => { vi.resetAllMocks(); mocks.client.mockResolvedValue({ id: "c", slug: "pcmidi", blogBaseUrl: "https://blog.test" }); mocks.rows.mockResolvedValue([row]); });
describe("consulta de tareas", () => {
  it("descubre etapas activas y consulta únicamente al cliente autenticado", async () => {
    const response = await GET(new Request("https://app.test/api/blog/jobs?client=pcmidi"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).jobs[0]).toMatchObject({ phase: "REVIEWING", operation: "generation", day: "2026-11-01" });
    expect(mocks.rows.mock.calls[0][0].where).toMatchObject({ clientId: "c" });
    expect(mocks.rows.mock.calls[0][0].where.OR).toContainEqual({ status: "PLANNED", preparation: { path: ["phase"], equals: "REVIEWING" } });
  });
  it("no descubre todas las reservas en espera; solo las solicitadas por ids", async () => {
    await GET(new Request("https://app.test/api/blog/jobs?client=pcmidi&ids=job,job,%3Cscript%3E"));
    expect(mocks.rows.mock.calls[0][0].where.OR.at(-1)).toEqual({ id: { in: ["job"] } });
    expect(mocks.rows.mock.calls[0][0].where.OR).not.toContainEqual({ status: "PLANNED" });
  });
  it("limita el seguimiento a veinte ids y no expone contenido del artículo", async () => {
    await GET(new Request(`https://app.test/api/blog/jobs?client=pcmidi&ids=${Array.from({ length: 40 }, (_, i) => `id-${i}`).join(",")}`));
    const query = mocks.rows.mock.calls[0][0]; expect(query.where.OR.at(-1).id.in).toHaveLength(20); expect(query.select.landing.select).not.toHaveProperty("htmlContent");
  });
  it("mantiene el descubrimiento de publicaciones para otros clientes", async () => {
    mocks.client.mockResolvedValue({ id: "other", slug: "prestige-running", blogBaseUrl: "" });
    await GET(new Request("https://app.test/api/blog/jobs?client=prestige-running"));
    expect(mocks.rows.mock.calls[0][0].where).toEqual({ clientId: "other", OR: [{ status: "PUBLISHING" }] });
  });
  it("rechaza accesos antes de leer tareas", async () => {
    mocks.client.mockRejectedValue(new ClientResolutionError("Sin acceso", 403));
    expect((await GET(new Request("https://app.test/api/blog/jobs?client=other"))).status).toBe(403);
    expect(mocks.rows).not.toHaveBeenCalled();
  });
});

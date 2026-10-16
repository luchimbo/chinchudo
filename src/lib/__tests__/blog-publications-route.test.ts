import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { blogPublication: { findMany: mocks.rows } } }));
vi.mock("@/lib/auth", async original => ({ ...await original<typeof import("@/lib/auth")>(), resolveClientForSlug: mocks.client }));
import { ClientResolutionError } from "@/lib/auth";
import { GET } from "@/app/api/blog/publications/route";

const row = { id: "job-1", status: "PUBLISHING", needsDeploy: false, lastError: "", updatedAt: new Date("2026-10-13T18:00:00Z"), landing: { titulo: "Guía de grabación", slug: "guia", contentCluster: { slug: "grabacion" } } };
beforeEach(() => { vi.resetAllMocks(); mocks.client.mockResolvedValue({ id: "pc", blogBaseUrl: "https://blog.pcmidicenter.com" }); mocks.rows.mockResolvedValue([{ ...row }]); });

describe("seguimiento de publicaciones", () => {
  it("descubre trabajos activos y filtra siempre por el cliente autorizado", async () => {
    const response = await GET(new Request("https://suite.test/api/blog/publications?client=pcmidi"));
    expect(response.status).toBe(200);
    expect(mocks.client).toHaveBeenCalledWith(expect.anything(), "pcmidi");
    expect(mocks.rows.mock.calls[0][0].where).toEqual({ clientId: "pc", OR: [{ status: "PUBLISHING" }] });
    expect((await response.json()).jobs[0]).toMatchObject({ status: "PUBLISHING", url: null });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("recupera el enlace solo después de publicar y verificar", async () => {
    mocks.rows.mockResolvedValue([{ ...row, status: "PUBLISHED" }]);
    const response = await GET(new Request("https://suite.test/api/blog/publications?client=pcmidi&ids=job-1"));
    expect((await response.json()).jobs[0].url).toBe("https://blog.pcmidicenter.com/guias/grabacion/guia/");
  });
  it("una revisión pendiente nunca se anuncia como terminada", async () => {
    mocks.rows.mockResolvedValue([{ ...row, status: "PUBLISHED", needsDeploy: true }]);
    const response = await GET(new Request("https://suite.test/api/blog/publications?client=pcmidi&ids=job-1"));
    expect((await response.json()).jobs[0]).toMatchObject({ status: "PUBLISHING", url: null });
  });
  it("un fallo conserva el motivo y no ofrece un enlace de éxito", async () => {
    mocks.rows.mockResolvedValue([{ ...row, status: "FAILED", lastError: "No se pudo verificar la versión" }]);
    const response = await GET(new Request("https://suite.test/api/blog/publications?client=pcmidi&ids=job-1"));
    expect((await response.json()).jobs[0]).toMatchObject({ status: "FAILED", error: "No se pudo verificar la versión", url: null });
  });
  it("una edición rechazada conserva la página anterior sin anunciar éxito de la actualización", async () => {
    mocks.rows.mockResolvedValue([{ ...row, status: "PUBLISHED", needsDeploy: false, lastError: "La revisión no tiene fuentes suficientes" }]);
    const response = await GET(new Request("https://suite.test/api/blog/publications?client=pcmidi&ids=job-1"));
    expect((await response.json()).jobs[0]).toMatchObject({ status: "FAILED", url: null });
  });
  it.each([401, 403])("no permite consultar trabajos sin acceso (%s)", async status => {
    mocks.client.mockRejectedValue(new ClientResolutionError("Sin acceso", status));
    expect((await GET(new Request("https://suite.test/api/blog/publications?client=other&ids=job-1"))).status).toBe(status);
    expect(mocks.rows).not.toHaveBeenCalled();
  });
  it("limita los identificadores y no pierde el filtro de cliente al buscarlos", async () => {
    const ids = ["bad!", ...Array.from({ length: 30 }, (_, i) => `job-${i}`)].join(",");
    await GET(new Request(`https://suite.test/api/blog/publications?client=pcmidi&ids=${encodeURIComponent(ids)}`));
    const where = mocks.rows.mock.calls[0][0].where;
    expect(where.clientId).toBe("pc"); expect(where.OR[1].id.in).toHaveLength(20);
    expect(where.OR[1].id.in).not.toContain("bad!");
    expect(where.OR[1].status.in).toEqual(["PUBLISHED", "FAILED"]);
  });
});

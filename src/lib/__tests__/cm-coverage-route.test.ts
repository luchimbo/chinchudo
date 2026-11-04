import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/auth")>(), resolveClientForSlug: mocks.client }));
vi.mock("@/lib/cm-coverage-snapshot", () => ({ readCoverageSnapshot: mocks.snapshot }));
import { GET } from "@/app/api/cm/coverage/route";
import { ClientResolutionError } from "@/lib/auth";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ id: "tenant" });
  mocks.snapshot.mockResolvedValue({ rows: Array.from({ length: 30 }, (_, i) => ({ id: `op-${i}`, status: "fresh" })), counts: { total: 30 }, pending: false });
});
describe("cobertura acotada a las tarjetas visibles", () => {
  it("entrega estados visibles y conserva los contadores globales del cliente", async () => {
    const response = await GET(new Request("https://app.test/api/cm/coverage?client=tenant&ids=op-2,op-5"));
    expect(await response.json()).toMatchObject({ rows: [{ id: "op-2" }, { id: "op-5" }], counts: { total: 30 } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("una página vacía no descarga todas las oportunidades", async () => {
    const response = await GET(new Request("https://app.test/api/cm/coverage?client=tenant&ids="));
    expect((await response.json()).rows).toEqual([]);
  });
  it("limita a 20 los IDs suministrados", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `op-${i}`).join(",");
    const response = await GET(new Request(`https://app.test/api/cm/coverage?client=tenant&ids=${ids}`));
    expect((await response.json()).rows).toHaveLength(20);
  });
  it("deniega el acceso antes de consultar el resumen", async () => {
    mocks.client.mockRejectedValue(new ClientResolutionError("Sin acceso", 403));
    expect((await GET(new Request("https://app.test/api/cm/coverage?client=other&ids=op-2"))).status).toBe(403);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
vi.mock("../cm-maintenance", () => ({ loadCMCoverage: vi.fn(async () => ({ version: "v2", counts: { total: 1 }, rows: [{ id: "op", status: "fresh", error: "", sourceText: "private", sourceTitle: "", channelId: "yt", detectedIntent: "GENERAL_DISCUSSION", detectedProductId: null, contextAssessment: {}, responses: [] }] })) }));
import { readCoverageSnapshot, refreshCoverageSnapshot } from "../cm-coverage-snapshot";
describe("instantáneas de cobertura", () => {
  it.each([0, 31_000])("reutiliza solo durante 30 segundos (%s ms)", async age => {
    const now = new Date(); const upsert = vi.fn(async () => ({ version: "v1", rows: [], counts: {}, calculatedAt: new Date(now.getTime() - age), invalidatedAt: new Date(0) }));
    const value = await readCoverageSnapshot({ cMCoverageSnapshot: { upsert } } as unknown as PrismaClient, "client");
    expect(value.pending).toBe(age > 30_000);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client" } }));
  });
  it("una invalidación durante el cálculo no queda cubierta por el timestamp final", async () => {
    const update = vi.fn(async (_input: { data: { rows: unknown } }) => ({}));
    await refreshCoverageSnapshot({ cMCoverageSnapshot: { update } } as unknown as PrismaClient, "client");
    const data = update.mock.calls[0][0].data;
    expect(data.rows).toEqual([expect.objectContaining({ id: "op", status: "fresh", error: "", revision: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(data.rows).not.toEqual([expect.objectContaining({ sourceText: expect.anything() })]);
    expect(data).not.toHaveProperty("invalidatedAt");
  });
});

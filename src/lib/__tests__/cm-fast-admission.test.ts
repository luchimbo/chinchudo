import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { currentManualFingerprint, fastManualAdmission } from "../cm-fast-admission";

const input = { client: "tenant", action: "generate" as const, opportunityId: "op", idempotencyKey: "75879bdb-e261-45cf-a1fa-092874dc073f" };
const accepted = { authenticated: true, authorized: true, owned: true, valid: true, keyMismatch: false, job: { id: "job", status: "QUEUED" } };
function fixture() {
  const query = vi.fn(async (_sql: { text: string; values: unknown[] }) => [accepted]);
  return { query, db: { $queryRaw: query } as unknown as PrismaClient };
}
describe("admisión atómica CM", () => {
  it("autoriza e inserta en una consulta parametrizada", async () => {
    const f = fixture();
    expect(await fastManualAdmission(f.db, { email: "operator@example.invalid", tokenVersion: 7 }, { ...input, productId: "' OR true --" })).toEqual(accepted.job);
    expect(f.query).toHaveBeenCalledTimes(1);
    const sql = f.query.mock.calls[0][0];
    expect(sql.text).toContain('u."tokenVersion"');
    expect(sql.text).toContain('JOIN authority a ON a."clientId" = o."clientId"');
    expect(sql.text).toContain("ON CONFLICT DO NOTHING");
    expect(sql.text).not.toContain("operator@example.invalid");
    expect(sql.text).not.toContain("' OR true --");
    expect(sql.values).toContain(7);
  });
  it.each([
    [{ authenticated: false, job: null }, 401],
    [{ authorized: false, job: null }, 403],
    [{ keyMismatch: true }, 409],
    [{ owned: false, valid: false, job: null }, 404],
    [{ valid: false, job: null }, 409],
  ])("rechaza autoridad o selección inválida: %j", async (change, status) => {
    const f = fixture(); f.query.mockResolvedValue([{ ...accepted, ...change }] as never);
    await expect(fastManualAdmission(f.db, { email: "operator", tokenVersion: 0 }, input)).rejects.toMatchObject({ status });
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("relee una única vez si otra inserción ganó después del snapshot", async () => {
    const f = fixture(); f.query.mockResolvedValueOnce([{ ...accepted, job: null }] as never);
    expect(await fastManualAdmission(f.db, { email: "operator", tokenVersion: 0 }, input)).toEqual(accepted.job);
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it("no gira indefinidamente cuando hay conflicto", async () => {
    const f = fixture(); f.query.mockResolvedValue([{ ...accepted, job: null }] as never);
    await expect(fastManualAdmission(f.db, { email: "operator", tokenVersion: 0 }, input)).rejects.toMatchObject({ status: 409 });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it("la huella del worker está acotada por oportunidad y cliente", async () => {
    const query = vi.fn(async (..._args: unknown[]) => [{ fingerprint: "db-v1:expected" }]);
    expect(await currentManualFingerprint({ $queryRaw: query } as unknown as PrismaClient, "op", "tenant")).toBe("db-v1:expected");
    const sql = query.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining(["op", "tenant"]));
    expect(sql.text).toContain('FROM "Product"');
    expect(sql.text).toContain('FROM "PromptVersion"');
    expect(sql.text).not.toContain('openrouterApiKey');
  });
});

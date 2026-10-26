import { describe, expect, it, vi } from "vitest";
import { findTranslations } from "./blog-translations";

describe("versiones archivadas del blog", () => {
  it("las excluye del editor y permite incluirlas al eliminar la familia completa", async () => {
    const findMany = vi.fn(async (_query: { where: Record<string, unknown> }) => []);
    const db = { landing: { findMany } } as unknown as Parameters<typeof findTranslations>[0];
    await findTranslations(db, "client", "original");
    expect(findMany.mock.calls[0]).toEqual([expect.objectContaining({ where: expect.objectContaining({ clientId: "client", status: { not: "ARCHIVED" } }) })]);
    await findTranslations(db, "client", "original", { includeArchived: true });
    expect(findMany.mock.calls[1][0].where).not.toHaveProperty("status");
  });
});

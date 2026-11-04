import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadBlogArticleSummaries } from "../blog-article-summary-query";
describe("listado compacto de artículos", () => {
  it("mantiene el cliente y la paginación como parámetros y convierte fechas", async () => {
    const query = vi.fn(async (_sql: { text: string; values: unknown[] }) => [{ item: { id: "article", createdAt: "2026-10-28T12:00:00+00:00" } }]);
    const rows = await loadBlogArticleSummaries({ $queryRaw: query } as unknown as PrismaClient, "tenant", "DRAFT", 2);
    expect(rows[0].createdAt).toEqual(new Date("2026-10-28T12:00:00Z"));
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql.values).toContain("tenant"); expect(sql.values).toContain(20);
    expect(sql.text).toContain('l."createdAt" DESC, l.id ASC');
    expect(sql.text).not.toContain("htmlContent");
  });
  it("el estado preview conserva la compatibilidad con aprobados", async () => {
    const query = vi.fn(async (_sql: { text: string; values: unknown[] }) => []);
    await loadBlogArticleSummaries({ $queryRaw: query } as unknown as PrismaClient, "tenant", "PREVIEW_ONLINE", 1);
    expect(query.mock.calls[0][0].values).toContainEqual(["APPROVED", "PREVIEW_ONLINE"]);
  });
});

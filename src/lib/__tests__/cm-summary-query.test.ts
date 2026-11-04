import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadCMSummaries } from "../cm-summary-query";
describe("consulta compacta CM", () => {
  it("usa una ida a Postgres, mantiene el alcance y parametriza filtros", async () => {
    const query = vi.fn(async (_sql: { text: string; values: unknown[] }) => []);
    await loadCMSummaries({ $queryRaw: query } as unknown as PrismaClient, { clientId: "tenant", brand: "' OR true --", channel: "yt", response: "fresh", ids: ["op"], sort: "oldest", page: 2 });
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql.text).not.toContain("' OR true --");
    expect(sql.values).toContain("tenant"); expect(sql.values).toContain("' OR true --");
    expect(sql.text).toContain('o."createdAt" ASC, o.id ASC');
    expect(sql.text).toContain("LIMIT 21"); expect(sql.text).toContain("NOT EXISTS");
  });
});

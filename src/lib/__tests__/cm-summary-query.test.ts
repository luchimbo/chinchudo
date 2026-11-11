import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cmPriorityReasons, cmQueueCoverage, cmQueueSort, loadCMSummaries } from "../cm-summary-query";

const now = new Date("2026-11-11T15:00:00Z");

describe("cola de oportunidades CM", () => {
  it("usa una ida a Postgres, mantiene el alcance y parametriza filtros", async () => {
    const query = vi.fn(async (_sql: { text: string; values: unknown[] }) => [{ page: 2, targetMissing: false, rows: [] }]);
    await loadCMSummaries({ $queryRaw: query } as unknown as PrismaClient, {
      clientId: "tenant", brand: "' OR true --", channel: "yt", response: "fresh", ids: ["op"],
      readyIds: [], sort: "oldest", page: 2, pageSize: 20, now,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql.text).not.toContain("' OR true --");
    expect(sql.values).toContain("tenant");
    expect(sql.values).toContain("' OR true --");
    expect(sql.text).toContain('ORDER BY "createdAt" ASC, id ASC');
    expect(sql.values).toContain(21);
    expect(sql.text).toContain("NOT EXISTS");
    expect(sql.text).not.toContain("row_number()");
  });

  it("combina motivos y usa la antigüedad cuando no hay señales prioritarias", () => {
    expect(cmPriorityReasons("PRICE_QUESTION", "2026-11-09T15:00:00Z", true, now))
      .toEqual(["Preguntó por precio", "Hace 2 días", "Respuesta lista para revisar"]);
    expect(cmPriorityReasons("GENERAL_DISCUSSION", "2026-11-11T14:00:00Z", false, now)).toEqual(["Hace 1 hora"]);
    expect(cmPriorityReasons("GENERAL_DISCUSSION", "2026-11-11T15:00:00Z", false, now)).toEqual(["Hace menos de 1 hora"]);
  });

  it("omite cobertura pendiente y toma Para hoy como predeterminado", () => {
    const rows = [{ id: "draft", status: "review", error: "" }];
    expect(cmQueueCoverage(rows, "review", true)).toEqual({ ids: [], readyIds: [] });
    expect(cmQueueCoverage(rows, "review")).toEqual({ ids: ["draft"], readyIds: ["draft"] });
    expect(cmQueueSort(undefined)).toBe("today");
    expect(cmQueueSort("relevance")).toBe("relevance");
  });
});

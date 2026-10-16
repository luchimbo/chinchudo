import { describe, expect, it, vi } from "vitest";
import { recoverMissedBlogArticles } from "../../scripts/blog-recovery.mjs";
import { editorialIntentForDate } from "./blog-quality.mjs";

function fixture() {
  const rows: any[] = ["2026-10-01", "2026-10-02", "2026-10-14"].map((day, i) => ({
    id: `s${i}`, clientId: "pc", landingId: `l${i}`, status: "READY", analysisRunId: null,
    scheduledDate: new Date(`${day}T00:00:00Z`), updatedAt: new Date(),
    landing: { id: `l${i}`, status: "DRAFT", slug: `article-${i}`, updatedAt: new Date(), htmlContent: JSON.stringify({ editorial_intent: editorialIntentForDate(day) }) },
  }));
  const db: any = {
    client: { findUniqueOrThrow: vi.fn(async () => ({ slug: "pcmidi" })) },
    blogPublication: {
      findMany: vi.fn(async () => rows),
      updateMany: vi.fn(async ({ where, data }) => { Object.assign(rows.find(r => r.id === where.id), data); return { count: 1 }; }),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    landing: { update: vi.fn(async () => ({})) },
    $transaction: vi.fn(async cb => cb(db)),
  };
  const inspect = vi.fn(async () => ({ publishable: true, checks: [] }));
  return { db, rows, inspect };
}

describe("recuperación del calendario de PC MIDI", () => {
  it("simula fechas libres del mismo tipo sin escribir ni mover artículos futuros", async () => {
    const { db, rows, inspect } = fixture();
    const result = await recoverMissedBlogArticles(db, "pc", { today: "2026-10-13", inspect });
    expect(result).toHaveLength(2);
    expect(result[0].to).toBe("2026-10-15"); expect(result[1].to).toBe("2026-10-16");
    expect(rows[0].scheduledDate.toISOString()).toContain("2026-10-01");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("recupera una sola vez conservando referencias y aprobación pendiente", async () => {
    const { db, rows, inspect } = fixture(); rows[0].requiresApproval = true;
    const first = await recoverMissedBlogArticles(db, "pc", { today: "2026-10-13", dryRun: false, inspect });
    const second = await recoverMissedBlogArticles(db, "pc", { today: "2026-10-13", dryRun: false, inspect });
    expect(first).toHaveLength(2); expect(second).toEqual([]);
    expect(rows[0]).toMatchObject({ id: "s0", landingId: "l0", requiresApproval: true, status: "READY" });
  });
  it("deja bloqueados los artículos sin evidencia con un motivo visible", async () => {
    const { db, rows } = fixture();
    const inspect = async () => ({ publishable: false, checks: [{ level: "error", message: "Faltan fuentes" }] });
    const result = await recoverMissedBlogArticles(db, "pc", { today: "2026-10-13", dryRun: false, inspect });
    expect(result.every(r => r.status === "BLOCKED")).toBe(true);
    expect(rows[0]).toMatchObject({ status: "FAILED", attempts: 3, lastError: "Faltan fuentes" });
    expect(db.landing.update).not.toHaveBeenCalled();
  });
  it("no toca publicaciones ni artículos archivados o en ejecución", async () => {
    const { db, rows, inspect } = fixture(); rows[0].status = "PUBLISHED"; rows[1].landing.status = "ARCHIVED";
    expect(await recoverMissedBlogArticles(db, "pc", { today: "2026-10-13", dryRun: false, inspect })).toEqual([]);
    expect(db.blogPublication.updateMany).not.toHaveBeenCalled();
  });
  it("rechaza otros clientes y cambios concurrentes", async () => {
    const { db, inspect } = fixture();
    db.client.findUniqueOrThrow.mockResolvedValueOnce({ slug: "prestige-running" });
    await expect(recoverMissedBlogArticles(db, "other", { today: "2026-10-13", inspect })).rejects.toThrow("PC MIDI");
    db.blogPublication.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(recoverMissedBlogArticles(db, "pc", { today: "2026-10-13", dryRun: false, inspect })).rejects.toThrow("cambió");
  });
});

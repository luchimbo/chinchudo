import type { PrismaClient, Prisma } from "@prisma/client";
import { loadCMCoverage } from "./cm-maintenance";
import { cmHash, cmInputHash } from "./cm-freshness";
import type { CoverageRow } from "./cm-coverage-view";

export const EMPTY_COVERAGE = { missing: 0, stale: 0, fresh: 0, review: 0, error: 0, total: 0 };
export type { CoverageRow } from "./cm-coverage-view";
export async function readCoverageSnapshot(db: PrismaClient, clientId: string) {
  const snapshot = await db.cMCoverageSnapshot.upsert({ where: { clientId },
    create: { clientId, calculatedAt: new Date(0) }, update: { requestedAt: new Date() } });
  const pending = snapshot.calculatedAt < snapshot.invalidatedAt || Date.now() - snapshot.calculatedAt.getTime() > 30_000;
  return { version: snapshot.version, counts: { ...EMPTY_COVERAGE, ...snapshot.counts as object },
    rows: snapshot.rows as unknown as CoverageRow[], pending, calculatedAt: snapshot.calculatedAt.toISOString() };
}
export async function refreshCoverageSnapshot(db: PrismaClient, clientId: string) {
  const startedAt = new Date();
  const coverage = await loadCMCoverage(db, clientId);
  const rows = coverage.rows.map(row => ({ id: row.id, status: row.status, error: row.error,
    revision: cmHash({ input: cmInputHash(row), responses: row.responses }),
    primaryResponseId: (row.responses.find(response => response.isPrimary) ?? row.responses[0])?.id || "",
    latestResponseId: row.responses[0]?.id || "",
  }));
  await db.cMCoverageSnapshot.update({ where: { clientId }, data: { version: coverage.version,
    counts: coverage.counts, rows: rows as Prisma.InputJsonValue, calculatedAt: startedAt } });
}

import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient(), dryRun = process.argv.includes("--dry-run");
const report = { command: "backfill-blog-metadata", at: new Date().toISOString(), dryRun, read: 0, updated: 0, conflicts: 0, errors: [] as { id: string; reason: string }[] };
let cursor: string | undefined;
try {
  while (true) {
    const rows = await db.landing.findMany({ orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, clientId: true, htmlContent: true, updatedAt: true } });
    if (!rows.length) break;
    const parents = await db.landing.findMany({ where: { id: { in: rows.flatMap(row => { try { const id = JSON.parse(row.htmlContent)?.translation_of; return typeof id === "string" ? [id] : []; } catch { return []; } }) } }, select: { id: true, clientId: true } });
    const verified: { id: string; at: string }[] = [];
    for (const row of rows) {
      report.read++;
      let data: Record<string, unknown> = {};
      try { const parsed = JSON.parse(row.htmlContent); if (parsed && typeof parsed === "object") data = parsed; }
      catch { if (row.htmlContent.trim().startsWith("{")) { report.errors.push({ id: row.id, reason: "invalid_json" }); continue; } }
      const language = ["es", "en", "de"].includes(String(data.language)) ? String(data.language) : "es";
      const translationOfId = typeof data.translation_of === "string" && data.translation_of ? data.translation_of : null;
      if (translationOfId) {
        const parent = parents.find(parent => parent.id === translationOfId && parent.clientId === row.clientId);
        if (!parent || parent.id === row.id) { report.errors.push({ id: row.id, reason: "invalid_or_cross_client_parent" }); continue; }
      }
      verified.push({ id: row.id, at: row.updatedAt.toISOString() });
    }
    if (!dryRun && verified.length) {
      // One round trip per batch. The trigger derives both values from current JSON;
      // expected timestamps prevent backfilling content changed after inspection.
      const changed = await db.$queryRaw<{ id: string }[]>`UPDATE "Landing" AS target SET language = coalesce(target.language, 'es') FROM jsonb_to_recordset(${JSON.stringify(verified)}::jsonb) AS expected(id text, at timestamptz) WHERE target.id = expected.id AND target."updatedAt" = expected.at AT TIME ZONE 'UTC' RETURNING target.id`;
      report.updated += changed.length; report.conflicts += verified.length - changed.length;
    } else report.updated += verified.length;
    cursor = rows[rows.length - 1].id;
  }
} finally {
  await mkdir("reports", { recursive: true });
  await writeFile(`reports/blog-metadata-backfill-${Date.now()}.json`, JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));
  await db.$disconnect();
}
if (report.errors.length || report.conflicts) process.exitCode = 2;

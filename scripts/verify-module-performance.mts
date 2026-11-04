import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient();
const report: Record<string, unknown> = { command: "verify-module-performance", at: new Date().toISOString() };
try {
  const rows = await db.landing.findMany({ select: { id: true, clientId: true, htmlContent: true, language: true, translationOfId: true } });
  report.metadataMismatches = rows.filter(row => {
    let content: Record<string, unknown> = {}; try { content = JSON.parse(row.htmlContent) || {}; } catch { /* Legacy HTML defaults to Spanish. */ }
    return row.language !== (["es", "en", "de"].includes(String(content.language)) ? content.language : "es") || row.translationOfId !== (typeof content.translation_of === "string" && content.translation_of ? content.translation_of : null);
  }).map(row => row.id);
  report.crossClientParents = rows.filter(row => row.translationOfId && !rows.some(parent => parent.id === row.translationOfId && parent.clientId === row.clientId)).map(row => row.id);
  report.rowCount = rows.length;
  const row = rows.find(row => !row.translationOfId);
  if (row) {
    report.indexPlan = await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, language FROM "Landing" WHERE "clientId" = ${row.clientId} AND "translationOfId" = ${row.id}`;
    try {
      await db.$transaction(async tx => {
        await tx.$executeRaw`UPDATE "Landing" SET "htmlContent" = ${JSON.stringify({ language: "de" })} WHERE id = ${row.id}`;
        const result = await tx.landing.findUniqueOrThrow({ where: { id: row.id }, select: { language: true } });
        report.rawWriterTrigger = result.language === "de";
        throw new Error("rollback-verification");
      });
    } catch (error) { if (!(error instanceof Error) || error.message !== "rollback-verification") throw error; }
    const foreign = rows.find(other => other.clientId !== row.clientId);
    if (foreign) {
      try {
        await db.$transaction(async tx => {
          await tx.$executeRaw`UPDATE "Landing" SET "htmlContent" = ${JSON.stringify({ language: "es", translation_of: foreign.id })} WHERE id = ${row.id}`;
          throw new Error("cross-client-was-accepted");
        });
      } catch (error) { report.crossClientTrigger = error instanceof Error && error.message.includes("invalid_translation_parent"); }
    }
  }
  report.rls = await db.$queryRaw`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('CMManualJob', 'CMCoverageSnapshot')`;
  const opportunity = await db.opportunity.findFirst({ where: { clientId: { not: null } }, select: { id: true, clientId: true } });
  if (opportunity?.clientId) {
    try {
      await db.$transaction(async tx => {
        const base = { clientId: opportunity.clientId!, requestedBy: "local-verification", opportunityId: opportunity.id, action: "generate", parameters: {}, inputVersion: "verification" };
        await tx.cMManualJob.create({ data: { ...base, idempotencyKey: crypto.randomUUID() } });
        await tx.cMManualJob.create({ data: { ...base, idempotencyKey: crypto.randomUUID() } });
        throw new Error("duplicate-was-accepted");
      });
    } catch (error) { report.activeJobUniqueness = (error as { code?: string }).code === "P2002"; }
  }
} finally {
  await writeFile("reports/module-performance-database-verification.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}
console.info(JSON.stringify({ metadataVerified: report.metadataMismatches instanceof Array && !report.metadataMismatches.length, rawWriterTrigger: report.rawWriterTrigger, crossClientTrigger: report.crossClientTrigger, activeJobUniqueness: report.activeJobUniqueness }));

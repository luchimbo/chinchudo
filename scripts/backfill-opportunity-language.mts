import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { detectOpportunityLanguage, opportunityLanguage } from "../src/lib/opportunity-language";

// Completa Opportunity.language en oportunidades que todavía no lo tienen.
// Kressmer reutiliza el idioma que ya guardó su radar; el resto usa la heurística local.
// Uso: npx tsx scripts/backfill-opportunity-language.mts [--dry-run] [--all]
//   --all  también recalcula las que ya tienen idioma.

loadEnv();
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const recalculate = args.includes("--all");
const BATCH = 500;

async function main() {
  const counts: Record<string, number> = {};
  let read = 0;
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.opportunity.findMany({
      where: { ...(recalculate ? {} : { language: "" }), ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, sourceText: true, contextAssessment: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    read += rows.length;
    const byLanguage = new Map<string, string[]>();
    for (const row of rows) {
      const radar = (row.contextAssessment as { kressmerRadar?: { language?: unknown } } | null)?.kressmerRadar;
      const language = opportunityLanguage(radar?.language) || detectOpportunityLanguage(row.sourceText);
      counts[language] = (counts[language] ?? 0) + 1;
      byLanguage.set(language, [...(byLanguage.get(language) ?? []), row.id]);
    }
    if (!dryRun) {
      for (const [language, ids] of byLanguage) {
        updated += (await prisma.opportunity.updateMany({ where: { id: { in: ids } }, data: { language } })).count;
      }
    }
  }
  const report = { command: "backfill-opportunity-language", date: new Date().toISOString(), dryRun, read, updated, counts };
  console.log(JSON.stringify(report, null, 2));
  writeReport("backfill-opportunity-language", report);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

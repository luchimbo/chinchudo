import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { rename } from "node:fs/promises";
import { PrismaClient, type Prisma } from "@prisma/client";
import { analyzeTrend } from "../src/lib/content-idea-generator";
import { analyzeReference, median } from "../src/lib/reel-craft";
// @ts-ignore
import { dataDir, loadEnv, readJsonl, writeReport, runtimeArchivePath } from "./agent-utils.mjs";

loadEnv();

const prisma = new PrismaClient();
const intakePath = join(dataDir, "reference-intake.jsonl");

type AccountRow = { type: "account"; referenceAccountId: string; clientId: string; ok: boolean; error: string };
type VideoRow = { type: "video"; referenceAccountId: string; clientId: string; platform: string; handle: string; title: string; source_url: string; views: number | null };

/**
 * Importa lo que leyó agents/reference-accounts.py: guarda cada video como
 * referencia (Trend) con su múltiplo contra la mediana de su propia cuenta
 * (ig-viral) y actualiza el estado de cada cuenta. Solo los videos que
 * destacan pasan por el análisis con IA, para no gastar de más.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true";
  let rows: (AccountRow | VideoRow)[] = [];
  try {
    rows = readJsonl(intakePath) as (AccountRow | VideoRow)[];
  } catch (err: any) {
    console.log(`import-reference-reels: sin archivo de entrada (${err.message})`);
    await prisma.$disconnect();
    return;
  }

  const accounts = rows.filter((row): row is AccountRow => row.type === "account");
  const videos = rows.filter((row): row is VideoRow => row.type === "video");
  const summary = { accounts: accounts.length, created: 0, updated: 0, outliers: 0, analyzed: 0, errors: [] as { item: string; error: string }[] };

  for (const account of accounts) {
    const batch = videos.filter((video) => video.referenceAccountId === account.referenceAccountId);
    const views = batch.map((video) => Number(video.views)).filter((value) => value > 0);
    const accountMedian = median(views);
    try {
      for (const video of batch) {
        const reelCraft = analyzeReference({ title: video.title, views: video.views && video.views > 0 ? video.views : null, channel: video.handle, channelViews: views });
        if (reelCraft.band === "signal") summary.outliers++;
        const metadata = { source: "reference_account", referenceAccountId: video.referenceAccountId, views: video.views, channel: video.handle, reelCraft } as unknown as Prisma.InputJsonValue;
        if (dryRun) continue;
        const existing = await prisma.trend.findFirst({ where: { clientId: video.clientId, sourceUrl: video.source_url }, select: { id: true } });
        if (existing) {
          await prisma.trend.update({ where: { id: existing.id }, data: { metadata } });
          summary.updated++;
          continue;
        }
        const trend = await prisma.trend.create({
          data: { clientId: video.clientId, title: video.title.slice(0, 300), description: `Video de @${video.handle}, cuenta de referencia.`, sourceUrl: video.source_url, platform: video.platform, queryUsed: `@${video.handle}`, metadata },
        });
        summary.created++;
        if (reelCraft.band === "signal") {
          await analyzeTrend(trend.id);
          summary.analyzed++;
        }
      }
      if (!dryRun) {
        await prisma.referenceAccount.update({
          where: { id: account.referenceAccountId },
          data: account.ok
            ? { medianViews: accountMedian ? Math.round(accountMedian) : null, lastScannedAt: new Date(), lastError: "", scanRequestedAt: null }
            : { lastError: account.error.slice(0, 240), scanRequestedAt: null },
        });
      }
    } catch (err: any) {
      summary.errors.push({ item: account.referenceAccountId, error: err.message });
    }
  }

  if (!dryRun && rows.length) {
    try {
      await rename(intakePath, runtimeArchivePath("reference-intake"));
    } catch {
      // si no se puede archivar, la próxima corrida lo vuelve a importar sin duplicar (upsert por URL)
    }
  }
  const report = writeReport("import-reference-reels", { command: "import-reference-reels", dry_run: dryRun, intake_path: intakePath, rows_read: rows.length, ...summary });
  await prisma.$disconnect();
  console.log(`import-reference-reels: ${summary.created} nuevos, ${summary.updated} actualizados, ${summary.outliers} destacados. Reporte: ${report}`);
  if (summary.errors.length) process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
}

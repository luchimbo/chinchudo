import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { rename } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { analyzeTrend } from "../src/lib/content-idea-generator";
import { analyzeReference, type ReelCraftTrendMeta } from "../src/lib/reel-craft";
// @ts-ignore
import { dataDir, loadEnv, readJsonl, writeReport, runtimeArchivePath } from "./agent-utils.mjs";

loadEnv();

const prisma = new PrismaClient();
const intakePath = join(dataDir, "trends-intake.jsonl");
const CHANNEL_WINDOW_DAYS = 90;

/**
 * ig-viral: la mediana de un canal sale de las referencias que ya guardamos de
 * ese mismo canal (sin requests extra). Con menos de 3 muestras no hay múltiplo.
 */
async function reelCraftFor(row: any): Promise<ReelCraftTrendMeta> {
  const metadata = row.metadata || {};
  const views = Number(metadata.views) > 0 ? Number(metadata.views) : null;
  const channel = typeof metadata.channel_id === "string" && metadata.channel_id ? metadata.channel_id : typeof metadata.channel === "string" && metadata.channel ? metadata.channel : null;
  let channelViews: number[] = [];
  if (channel && views) {
    const key = metadata.channel_id ? "channel_id" : "channel";
    const previous = await prisma.trend.findMany({
      where: { clientId: row.clientId, metadata: { path: [key], equals: channel }, createdAt: { gte: new Date(Date.now() - CHANNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
      select: { metadata: true },
      take: 12,
      orderBy: { createdAt: "desc" },
    });
    channelViews = previous.map((trend) => Number((trend.metadata as any)?.views)).filter((value) => value > 0);
  }
  return analyzeReference({ title: row.title, views, channel: metadata.channel ?? null, channelViews });
}

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
  };
}

async function main() {
  const args = parseArgs();
  let rows: any[] = [];
  try {
    rows = readJsonl(intakePath) as any[];
  } catch (err: any) {
    console.log(`import-trends: No se pudo leer el archivo de entrada (puede estar vacío): ${err.message}`);
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  let outliers = 0;
  const errors: { title: string; error: string }[] = [];

  console.log(`import-trends: Iniciando importación de ${rows.length} registros...`);

  for (const row of rows) {
    try {
      if (!row.title || !row.clientId) {
        skipped++;
        continue;
      }

      // Validar si ya existe una tendencia con la misma URL de origen
      const existing = await prisma.trend.findFirst({
        where: {
          sourceUrl: row.source_url || "",
          clientId: row.clientId,
        },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      const reelCraft = await reelCraftFor(row);
      if (reelCraft.band === "signal") outliers++;

      if (!args.dryRun) {
        const trend = await prisma.trend.create({
          data: {
            clientId: row.clientId,
            title: row.title,
            description: row.description || "",
            sourceUrl: row.source_url || "",
            platform: row.platform || "GOOGLE_TRENDS",
            queryUsed: row.query_used || "",
            metadata: { ...(row.metadata || {}), reelCraft },
          },
        });
        await analyzeTrend(trend.id);
      }
      created++;
    } catch (err: any) {
      errors.push({ title: row.title || "Sin título", error: err.message });
    }
  }

  // Mover archivo intake a backup si no es dryRun
  if (!args.dryRun && rows.length > 0) {
    const archivePath = runtimeArchivePath("trends-intake");
    try {
      await rename(intakePath, archivePath);
    } catch {
      // Omitir error si no se puede renombrar
    }
  }

  const report = writeReport("import-trends", {
    command: "import-trends",
    dry_run: args.dryRun,
    intake_path: intakePath,
    rows_read: rows.length,
    created,
    duplicates,
    skipped,
    outliers_3x: outliers,
    errors,
  });

  await prisma.$disconnect();

  if (errors.length) {
    console.error(`import-trends: Completado con ${errors.length} errores. Reporte: ${report}`);
    process.exit(1);
  }

  console.log(`import-trends: ${created} tendencias importadas (${outliers} outliers 3x), ${duplicates} duplicadas, ${skipped} omitidas. Reporte: ${report}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
}

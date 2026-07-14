import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { rename } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { dataDir, loadEnv, readJsonl, writeReport } from "./agent-utils.mjs";

loadEnv();

const prisma = new PrismaClient();
const SOCIAL_INTAKE = join(dataDir, "ai-presence-social.jsonl");
const DIRECT_INTAKE = join(dataDir, "ai-presence-direct.jsonl");

const VALID_SOURCE_TYPES = new Set([
  "DIRECT_AI_QUERY",
  "SOCIAL_COMMENT",
  "SOCIAL_VIDEO",
  "SOCIAL_POST",
]);

const VALID_INTENTS = new Set([
  "PURCHASE_QUESTION",
  "TECHNICAL_QUESTION",
  "PRICE_QUESTION",
  "WARRANTY_QUESTION",
  "COMPARISON",
  "COMPETITOR_MENTION",
  "BRAND_MENTION",
  "RECOMMENDATION",
  "GENERAL_DISCUSSION",
]);

const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
  };
}

function normalizeSourceType(value: string): any {
  const upper = String(value || "").toUpperCase();
  if (VALID_SOURCE_TYPES.has(upper)) return upper;
  return "SOCIAL_POST";
}

function normalizeIntent(value: string): any {
  const upper = String(value || "").toUpperCase();
  if (VALID_INTENTS.has(upper)) return upper;
  return "GENERAL_DISCUSSION";
}

function normalizePriority(value: string): any {
  const upper = String(value || "").toUpperCase();
  if (VALID_PRIORITIES.has(upper)) return upper;
  return "MEDIUM";
}

function dedupeKey(row: any): string {
  const sourceUrl = String(row.sourceUrl || "").trim();
  const context = String(row.context || "").trim().slice(0, 200);
  const query = String(row.query || "").trim().slice(0, 100);
  const author = String(row.author || "").trim().toLowerCase();
  const sourceType = String(row.sourceType || "").toUpperCase();
  return `${sourceType}::${query}::${author}::${sourceUrl}::${context}`;
}

async function resolveClientId(row: any): Promise<string | null> {
  const explicit = String(row.clientId || "").trim();
  if (explicit) return explicit;

  // Fallback al cliente por slug o por defecto pcmidi
  try {
    const slug = String(row.clientSlug || "pcmidi").trim() || "pcmidi";
    const client = await prisma.client.findUnique({
      where: { slug },
      select: { id: true },
    });
    return client?.id ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs();
  const rows: any[] = [];

  for (const path of [SOCIAL_INTAKE, DIRECT_INTAKE]) {
    try {
      const batch = readJsonl(path) as any[];
      rows.push(...batch);
    } catch (err: any) {
      console.log(`import-ai-presence: No se pudo leer ${path} (puede estar vacio): ${err.message}`);
    }
  }

  console.log(`import-ai-presence: ${rows.length} registros para importar`);

  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors: { key: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    try {
      if (!row || typeof row !== "object") {
        skipped++;
        continue;
      }

      const key = dedupeKey(row);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);

      const clientId = await resolveClientId(row);
      if (!clientId) {
        skipped++;
        continue;
      }

      // Verificar duplicado previo en DB por sourceUrl + contexto parcial
      const existing = await prisma.aIPresenceResult.findFirst({
        where: {
          clientId,
          sourceType: normalizeSourceType(row.sourceType),
          sourceUrl: String(row.sourceUrl || "").trim() || undefined,
          context: {
            startsWith: String(row.context || "").trim().slice(0, 120),
          },
        },
      });
      if (existing) {
        duplicates++;
        continue;
      }

      if (!args.dryRun) {
        await prisma.aIPresenceResult.create({
          data: {
            clientId,
            sourceType: normalizeSourceType(row.sourceType),
            channel: String(row.channel || "").trim().toLowerCase(),
            query: String(row.query || "").trim(),
            sourceUrl: String(row.sourceUrl || "").trim(),
            videoUrl: String(row.videoUrl || "").trim(),
            videoTitle: String(row.videoTitle || "").trim(),
            author: String(row.author || "").trim(),
            context: String(row.context || "").trim(),
            aiResponse: String(row.aiResponse || "").trim(),
            relevanceScore: Math.max(0, Math.min(100, Number(row.relevanceScore) || 0)),
            brandDetected: String(row.brandDetected || "").trim(),
            intent: normalizeIntent(row.intent),
            priority: normalizePriority(row.priority),
            aiReasoning: String(row.aiReasoning || "").trim(),
            modelUsed: String(row.modelUsed || "").trim(),
            metadata: row.metadata || {},
          },
        });
      }
      created++;
    } catch (err: any) {
      errors.push({ key: dedupeKey(row), error: err.message });
    }
  }

  // Archivar intakes si no es dry-run
  if (!args.dryRun && rows.length > 0) {
    for (const path of [SOCIAL_INTAKE, DIRECT_INTAKE]) {
      const archivePath = join(dataDir, `ai-presence-${path.endsWith("social.jsonl") ? "social" : "direct"}-${Date.now()}.jsonl.bak`);
      try {
        await rename(path, archivePath);
      } catch {
        // Non-fatal: intake may not exist or may already have been moved.
      }
    }
  }

  const report = writeReport("import-ai-presence", {
    command: "import-ai-presence",
    dry_run: args.dryRun,
    rows_read: rows.length,
    created,
    duplicates,
    skipped,
    errors,
  });

  await prisma.$disconnect();

  if (errors.length) {
    console.error(`import-ai-presence: ${errors.length} errores. Reporte: ${report}`);
    process.exit(1);
  }
  console.log(`import-ai-presence: ${created} resultados importados, ${duplicates} duplicados, ${skipped} omitidos. Reporte: ${report}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
}

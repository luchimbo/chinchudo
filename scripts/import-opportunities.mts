import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { rename } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { dataDir, loadEnv, readJsonl, writeReport, extractPostKey, isDomainRelevant, looksLikeSpam } from "./agent-utils.mjs";
import {
  normalizeForMatch,
  parseClientList,
  resolveOpportunityClient
} from "../src/lib/client-context";
import { classifyOpportunity } from "../src/lib/ai-opportunity-classifier";

loadEnv();

const prisma = new PrismaClient();
const intakePath = join(dataDir, "social-listen-intake.jsonl");

const channelDefaults: Record<string, { name: string; type: string; baseUrl: string }> = {
  youtube: { name: "YouTube", type: "video_comments", baseUrl: "https://www.youtube.com" },
  facebook: { name: "Facebook", type: "groups_posts", baseUrl: "https://www.facebook.com" },
  instagram: { name: "Instagram", type: "reels_comments", baseUrl: "https://www.instagram.com" },
  x: { name: "X", type: "threads", baseUrl: "https://x.com" },
  reddit: { name: "Reddit", type: "public_threads", baseUrl: "https://www.reddit.com" },
};

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
  };
}

function channelDefaultsFor(value: string) {
  const key = String(value || "youtube").toLowerCase();
  return channelDefaults[key] ?? {
    name: key.charAt(0).toUpperCase() + key.slice(1),
    type: "monitored_source",
    baseUrl: "",
  };
}

export function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  const has = (kws: string[]) => kws.some((kw) => lower.includes(kw));
  if (has(["driver", "compatib", "instalar", "instala", "funciona", "funcionar", "conectar", "puerto", "reconoce", "detecta", "hz", "latencia", "midi", "software", "plugin", "daw", "error", "configurar", "no suena", "no funciona", "no reconoce", "windows", "mac", "usb", "bluetooth", "asio"])) return "TECHNICAL_QUESTION";
  if (has(["garantia", "garantía", "devolucion", "devolución", "cambio", "roto", "falla", "fallo", "service", "posventa"])) return "WARRANTY_QUESTION";
  if (has(["precio", "cuanto", "cuánto", "costo", "cuesta", "$"])) return "PRICE_QUESTION";
  if (has(["comprar", "comprarlo", "donde consigo", "consigo", "donde compro", "envio", "envío", "delivery", "conviene", "vale la pena", "disponible", "stock"])) return "PURCHASE_QUESTION";
  if (has([" vs ", " versus ", "diferencia entre", "mejor que", "comparar", "comparacion", "comparación", "cual conviene", "cuál conviene"])) return "COMPARISON";
  return "GENERAL_DISCUSSION";
}

export function detectPriority(intent: string, text: string): string {
  if (intent === "PURCHASE_QUESTION" || intent === "TECHNICAL_QUESTION") return "HIGH";
  if (intent === "WARRANTY_QUESTION" || intent === "PRICE_QUESTION" || intent === "COMPARISON") return "MEDIUM";
  const lower = text.toLowerCase();
  if (lower.includes("urgente") || lower.includes("hoy")) return "HIGH";
  return "LOW";
}

function buildNotes(row: any) {
  const parts = [row.notes || "Importada desde social-listen; revisar antes de generar respuesta."];
  if (row.sourceType) parts.push(`Fuente: ${row.sourceType}.`);
  if (row.videoUrl) parts.push(`Video: ${row.videoUrl}.`);
  if (row.publishedTime) parts.push(`Fecha visible: ${row.publishedTime}.`);
  if (row.account) parts.push(`Cuenta agente: ${row.account}.`);
  return parts.join(" ");
}

function normalizeAuthorName(author: string): string {
  return author.trim().toLowerCase().replace(/^(@|u\/|r\/)/, "");
}

async function main() {
  const args = parseArgs();
  const rows = readJsonl(intakePath) as any[];
  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  let discardedAtImport = 0;
  const errors: { sourceUrl: string; error: string }[] = [];
  const sourceCounts = new Map<string, number>();
  const routing: any[] = [];

  // Cargar listado de cuentas propias para exclusión
  const ownUsernames = new Set<string>();
  const accountsPath = join(process.cwd(), "agents/accounts.json");
  try {
    const rawAccounts = JSON.parse(readFileSync(accountsPath, "utf-8"));
    for (const [key, cfg] of Object.entries(rawAccounts) as [string, any][]) {
      ownUsernames.add(normalizeAuthorName(key));
      ownUsernames.add(normalizeAuthorName(cfg.label));
      if (cfg.twitterUsername) ownUsernames.add(normalizeAuthorName(cfg.twitterUsername));
    }
  } catch (err: any) {
    console.warn("import-opportunities: No se pudo leer agents/accounts.json para filtrado de autor:", err.message);
  }

  // Cargar marcas y clientes
  try {
    const clients = await prisma.client.findMany({ select: { name: true, slug: true } });
    const brands = await prisma.brand.findMany({ select: { name: true } });
    for (const c of clients) {
      ownUsernames.add(normalizeAuthorName(c.slug));
      ownUsernames.add(normalizeAuthorName(c.name));
    }
    for (const b of brands) {
      ownUsernames.add(normalizeAuthorName(b.name));
    }
  } catch (err: any) {
    console.warn("import-opportunities: No se pudieron cargar marcas de DB para exclusión:", err.message);
  }

  // Agrega handles conocidos de marca como salvaguarda
  ownUsernames.add("midiplus_ok");
  ownUsernames.add("pcmidicenter");
  ownUsernames.add("prestigearg");
  ownUsernames.add("kressmer_audio");

  for (const row of rows) {
    const sourceUrl = String(row.sourceUrl || "").trim();
    const sourceText = String(row.sourceText || "").trim();
    if (!sourceUrl || sourceText.length < 10) {
      skipped += 1;
      continue;
    }

    // Filtrar por autor propio o marcas propias
    const author = String(row.sourceAuthor || "").trim();
    const normAuthor = normalizeAuthorName(author);
    if (normAuthor && ownUsernames.has(normAuthor)) {
      console.log(`[Skip] Oportunidad omitida. Autor propio/marca detectada: "${author}" (normalizado: "${normAuthor}")`);
      skipped += 1;
      continue;
    }

    const postKey = extractPostKey(row.channel, sourceUrl);
    const existing = postKey
      ? await prisma.opportunity.findFirst({ where: { sourceUrl: { contains: postKey } } })
      : await prisma.opportunity.findFirst({ where: { sourceUrl } });
    if (existing) {
      duplicates += 1;
      continue;
    }

    const relevanceText = `${sourceText} ${row.sourceTitle || ""} ${row.videoTitle || ""}`;
    const monitoredSourceId = String(row.monitoredSourceId || "").trim() || null;
    const monitoredSource = monitoredSourceId
      ? await prisma.monitoredSource.findUnique({ where: { id: monitoredSourceId }, include: { client: true } })
      : null;
    const resolution = await resolveOpportunityClient(prisma, {
      sourceText: relevanceText,
      detectedBrandId: null,
      monitoredSourceId,
      monitoredSource,
    });

    routing.push({
      sourceUrl,
      clientId: resolution.client.id,
      clientSlug: resolution.client.slug,
      confidence: resolution.confidence,
      reason: resolution.reason,
      account: row.account || "",
    });

    // ── Clasificación por IA ──
    let isDiscarded = false;
    let discardNotes = "";
    let aiResult;

    try {
      aiResult = await classifyOpportunity(prisma, {
        sourceText,
        sourceTitle: row.sourceTitle || "",
        videoTitle: row.videoTitle || "",
        channel: row.channel,
        clientId: resolution.client.id,
      });

      if (!aiResult.isSupportedLanguage || aiResult.isSpamOrFluff || !aiResult.isRelevant) {
        isDiscarded = true;
        discardNotes = `[Filtro IA] Descartado. Razón: ${aiResult.actionableReason}. (Idioma: ${aiResult.language}, Spam: ${aiResult.isSpamOrFluff}, Relevante: ${aiResult.isRelevant})`;
        discardedAtImport += 1;
      }
    } catch (err) {
      errors.push({ sourceUrl, error: `Clasificador IA falló: ${(err as Error).message}` });
      // Fallback a clasificación local si falla la IA
      const intent = row.detectedIntent || detectIntent(sourceText);
      aiResult = {
        isSpanish: true,
        isSupportedLanguage: true,
        language: "es" as const,
        isSpamOrFluff: false,
        isRelevant: true,
        actionableReason: `Fallback local por error de IA: ${(err as Error).message}`,
        detectedIntent: intent as any,
        priority: (row.priority || detectPriority(intent, sourceText)) as any,
        matchedBrandId: null,
        matchedProductId: null,
        confidence: "low" as const
      };
    }

    const channelSeed = channelDefaultsFor(row.channel);

    if (args.dryRun) {
      created += 1;
      continue;
    }

    try {
      const channel = await prisma.channel.upsert({
        where: { name: channelSeed.name },
        update: {},
        create: {
          ...channelSeed,
          responseStyleNotes: "Fuente monitoreada por agentes internos; requiere revision manual.",
        },
      });

      const finalStatus = isDiscarded ? "DISCARDED" : "NEW";
      const notes = isDiscarded
        ? `${buildNotes(row)} ${discardNotes} Cliente: ${resolution.client.slug}.`
        : `${buildNotes(row)} Cliente: ${resolution.client.slug} (${resolution.confidence}, ${resolution.reason}). Razón IA: ${aiResult.actionableReason}`;

      await prisma.opportunity.create({
        data: {
          channelId: channel.id,
          sourceUrl,
          sourceAuthor: row.sourceAuthor || "",
          sourceText,
          clientId: resolution.client.id,
          detectedBrandId: aiResult.matchedBrandId,
          detectedProductId: aiResult.matchedProductId,
          detectedIntent: aiResult.detectedIntent,
          priority: aiResult.priority,
          status: finalStatus,
          notes,
          monitoredSourceId,
        },
      });
      created += 1;
      if (monitoredSourceId) sourceCounts.set(monitoredSourceId, (sourceCounts.get(monitoredSourceId) ?? 0) + 1);
    } catch (error) {
      errors.push({ sourceUrl, error: (error as Error).message });
    }
  }

  if (!args.dryRun) {
    for (const [sourceId, count] of sourceCounts.entries()) {
      try {
        await prisma.monitoredSource.update({
          where: { id: sourceId },
          data: { lastRunAt: new Date(), lastCount: count },
        });
      } catch (error) {
        errors.push({ sourceUrl: `source:${sourceId}`, error: (error as Error).message });
      }
    }
  }

  if (!args.dryRun && rows.length > 0) {
    const archivePath = join(dataDir, `social-listen-intake-${Date.now()}.jsonl.bak`);
    try {
      await rename(intakePath, archivePath);
    } catch {
      // Non-fatal: intake may not exist or may already have been moved.
    }
  }

  const report = writeReport("import-opportunities", {
    command: "import-opportunities",
    dry_run: args.dryRun,
    intake_path: intakePath,
    rows_read: rows.length,
    created,
    duplicates,
    skipped,
    discarded_at_import: discardedAtImport,
    routing,
    errors,
  });

  await prisma.$disconnect();

  if (errors.length) {
    console.error(`import-opportunities: ${errors.length} errores. Reporte: ${report}`);
    process.exit(1);
  }
  console.log(`import-opportunities: ${created} procesadas (${discardedAtImport} de ellas auto-descartadas), ${duplicates} duplicadas. Reporte: ${report}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
}

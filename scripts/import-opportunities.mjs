import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { rename } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { dataDir, loadEnv, readJsonl, writeReport, extractPostKey, isDomainRelevant, looksLikeSpam } from "./agent-utils.mjs";

loadEnv();

const prisma = new PrismaClient();
const intakePath = join(dataDir, "social-listen-intake.jsonl");

const channelDefaults = {
  youtube: { name: "YouTube", type: "video_comments", baseUrl: "https://www.youtube.com" },
  facebook: { name: "Facebook", type: "groups_posts", baseUrl: "https://www.facebook.com" },
  instagram: { name: "Instagram", type: "reels_comments", baseUrl: "https://www.instagram.com" },
  x: { name: "X", type: "threads", baseUrl: "https://x.com" },
  reddit: { name: "Reddit", type: "public_threads", baseUrl: "https://www.reddit.com" }
};

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true"
  };
}

function channelDefaultsFor(value) {
  const key = String(value || "youtube").toLowerCase();
  return channelDefaults[key] ?? {
    name: key.charAt(0).toUpperCase() + key.slice(1),
    type: "monitored_source",
    baseUrl: ""
  };
}

export function detectIntent(text) {
  const lower = text.toLowerCase();
  const has = (kws) => kws.some((kw) => lower.includes(kw));
  if (has(["driver", "compatib", "instalar", "instala", "funciona", "funcionar", "conectar", "puerto", "reconoce", "detecta", "hz", "latencia", "midi", "software", "plugin", "daw", "error", "configurar", "no suena", "no funciona", "no reconoce", "windows", "mac", "usb", "bluetooth", "asio"])) return "TECHNICAL_QUESTION";
  if (has(["garantía", "garantia", "devolución", "devolucion", "cambio", "roto", "falla", "fallo", "service", "posventa"])) return "WARRANTY_QUESTION";
  if (has(["precio", "cuánto", "cuanto", "costo", "cuesta", "$"])) return "PRICE_QUESTION";
  if (has(["comprar", "comprarlo", "donde consigo", "consigo", "donde compro", "envío", "envio", "delivery", "conviene", "vale la pena", "disponible", "stock"])) return "PURCHASE_QUESTION";
  if (has([" vs ", " versus ", "diferencia entre", "mejor que", "comparar", "comparacion", "comparación", "cual conviene", "cuál conviene"])) return "COMPARISON";
  return "GENERAL_DISCUSSION";
}

export function detectPriority(intent, text) {
  if (intent === "PURCHASE_QUESTION" || intent === "TECHNICAL_QUESTION") return "HIGH";
  if (intent === "WARRANTY_QUESTION" || intent === "PRICE_QUESTION" || intent === "COMPARISON") return "MEDIUM";
  const lower = text.toLowerCase();
  if (lower.includes("urgente") || lower.includes("hoy")) return "HIGH";
  return "LOW";
}

function buildNotes(row) {
  const parts = [row.notes || "Importada desde social-listen; revisar antes de generar respuesta."];
  if (row.sourceType) parts.push(`Fuente: ${row.sourceType}.`);
  if (row.videoUrl) parts.push(`Video: ${row.videoUrl}.`);
  if (row.publishedTime) parts.push(`Fecha visible: ${row.publishedTime}.`);
  if (row.account) parts.push(`Cuenta agente: ${row.account}.`);
  return parts.join(" ");
}

async function findBrand(text) {
  const brands = await prisma.brand.findMany();
  const lower = text.toLowerCase();
  return brands.find((brand) => lower.includes(brand.name.toLowerCase())) ?? null;
}

async function main() {
  const args = parseArgs();
  const rows = readJsonl(intakePath);
  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  let discardedAtImport = 0;
  const errors = [];
  const sourceCounts = new Map(); // monitoredSourceId -> oportunidades creadas en esta corrida

  for (const row of rows) {
    const sourceUrl = String(row.sourceUrl || "").trim();
    const sourceText = String(row.sourceText || "").trim();
    if (!sourceUrl || sourceText.length < 10) {
      skipped += 1;
      continue;
    }

    // Dedup por POST: una sola oportunidad por video/hilo/publicación.
    // Si ya existe una oportunidad para el mismo post (aunque sea otro comentario), se saltea.
    const postKey = extractPostKey(row.channel, sourceUrl);
    const existing = postKey
      ? await prisma.opportunity.findFirst({ where: { sourceUrl: { contains: postKey } } })
      : await prisma.opportunity.findFirst({ where: { sourceUrl } });
    if (existing) {
      duplicates += 1;
      continue;
    }

    // Filtro de basura: descartar bots de ofertas/marketplace y posts fuera de tema.
    // Se mira el texto + el título del post (un comentario corto on-topic suele estar
    // en un video/post cuyo título sí tiene palabras del dominio).
    const relevanceText = `${sourceText} ${row.sourceTitle || ""} ${row.videoTitle || ""}`;
    if (looksLikeSpam(sourceText, row.sourceAuthor) || !isDomainRelevant(relevanceText)) {
      discardedAtImport += 1;
      continue;
    }

    const intent = row.detectedIntent || detectIntent(sourceText);
    const sourceType = String(row.sourceType || "");
    const isComment = ["instagram_comment", "facebook_comment", "tiktok_comment"].includes(sourceType);

    if (isComment) {
      // Comentarios: solo pasan si tienen pregunta, keyword de valor, o texto sustancial
      const hasQuestion  = sourceText.includes("?");
      const hasKeyword   = intent !== "GENERAL_DISCUSSION";
      const isSubstantial = sourceText.length >= 80;
      const realWords    = sourceText.split(/\s+/).filter(w => /[a-záéíóúñü]{3,}/i.test(w)).length;
      if (realWords < 4 || (!hasQuestion && !hasKeyword && !isSubstantial)) {
        discardedAtImport += 1;
        continue;
      }
    } else {
      if (intent === "GENERAL_DISCUSSION" && !sourceText.includes("?") && sourceText.length < 40) {
        discardedAtImport += 1;
        continue;
      }
    }

    const channelSeed = channelDefaultsFor(row.channel);
    const brand = await findBrand(`${sourceText} ${row.sourceTitle || ""}`);

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
          responseStyleNotes: "Fuente monitoreada por agentes internos; requiere revision manual."
        }
      });

      const monitoredSourceId = String(row.monitoredSourceId || "").trim() || null;
      await prisma.opportunity.create({
        data: {
          channelId: channel.id,
          sourceUrl,
          sourceAuthor: row.sourceAuthor || "",
          sourceText,
          detectedBrandId: brand?.id ?? null,
          detectedIntent: intent,
          priority: row.priority || detectPriority(intent, sourceText),
          status: "NEW",
          notes: buildNotes(row),
          monitoredSourceId
        }
      });
      created += 1;
      if (monitoredSourceId) sourceCounts.set(monitoredSourceId, (sourceCounts.get(monitoredSourceId) ?? 0) + 1);
    } catch (error) {
      errors.push({ sourceUrl, error: error.message });
    }
  }

  // Sellar la última corrida de cada fuente monitoreada que produjo detecciones.
  if (!args.dryRun) {
    for (const [sourceId, count] of sourceCounts.entries()) {
      try {
        await prisma.monitoredSource.update({
          where: { id: sourceId },
          data: { lastRunAt: new Date(), lastCount: count }
        });
      } catch (error) {
        errors.push({ sourceUrl: `source:${sourceId}`, error: error.message });
      }
    }
  }

  // Rotar el intake para que la próxima corrida empiece limpio.
  // Hacemos rename (atomic) en lugar de truncar, así no se pierde nada si algo falla.
  if (!args.dryRun && rows.length > 0) {
    const archivePath = join(dataDir, `social-listen-intake-${Date.now()}.jsonl.bak`);
    try {
      await rename(intakePath, archivePath);
    } catch {
      // Si no existía el archivo o no se puede renombrar, no es fatal
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
    errors
  });

  await prisma.$disconnect();

  if (errors.length) {
    console.error(`import-opportunities: ${errors.length} errores. Reporte: ${report}`);
    process.exit(1);
  }
  console.log(`import-opportunities: ${created} nuevas, ${duplicates} duplicadas, ${discardedAtImport} descartadas. Reporte: ${report}`);
}

// Solo ejecutar al invocar el script directamente; permite importar detectIntent/detectPriority en tests.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
}

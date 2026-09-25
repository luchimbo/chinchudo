import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { loadEnv, runtimeArchiveDir, writeReport } from "./agent-utils.mjs";
import { looksSpanish, pickYouTubeDisplayTitle, usableTitle } from "../src/lib/opportunity-source-metadata";
import { fetchYouTubeTitle, youtubeVideoId } from "../src/lib/source-author";

// Completa/corrige Opportunity.sourceTitle en videos de YouTube (la UI muestra
// solo el título, sin la descripción). Regla: en español si existe una versión
// en español (original, doblada o traducida por YouTube); si no, el original.
// - Original: el título ya guardado o el de oEmbed (siempre el idioma original).
// - Alternativas: los títulos que vieron los buscadores, leídos de los lotes
//   archivados en runtime/archive (sin consultar YouTube).
// - --relocalize suma el título que muestra la página del video en español.
//   Si YouTube bloquea (google.com/sorry) se deja de consultar.
// Los comentarios se omiten: ahí se muestra el comentario.
// Uso: npx tsx scripts/backfill-youtube-titles.mts [--dry-run] [--all] [--limit N] [--relocalize]

loadEnv();
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const includeDiscarded = args.includes("--all");
const relocalize = args.includes("--relocalize");
const argValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const limit = Number(argValue("--limit") || 0) || undefined;
const CONCURRENCY = relocalize ? 1 : 4;
const COMMENT_URL = /[?&]lc=|#comment-/;
const TITLE_MARKER = '"videoPrimaryInfoRenderer":{"title":{"runs":';
let pageBlocked = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Títulos por id de video según los lotes de escucha ya importados. */
function loadArchivedTitles() {
  const titles = new Map<string, Set<string>>();
  let files: string[] = [];
  try {
    files = readdirSync(runtimeArchiveDir).filter((file) => file.includes("social-listen-intake"));
  } catch {
    return titles;
  }
  for (const file of files) {
    for (const line of readFileSync(join(runtimeArchiveDir, file), "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const videoId = youtubeVideoId(String(row.sourceUrl || ""));
        const title = String(row.sourceTitle || "").trim();
        if (!videoId || !title || row.sourceType === "youtube_comment") continue;
        if (!titles.has(videoId)) titles.set(videoId, new Set());
        titles.get(videoId)!.add(title);
      } catch {
        // Líneas corruptas de lotes viejos: se ignoran.
      }
    }
  }
  return titles;
}

/** Título que muestra YouTube en español (puede ser una traducción del original). */
async function fetchLocalizedTitle(sourceUrl: string): Promise<string> {
  const videoId = youtubeVideoId(sourceUrl);
  if (!videoId || pageBlocked) return "";
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=es-419&gl=AR`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "es-AR,es;q=0.9" },
    });
    if (response.status === 429 || response.url.includes("/sorry/")) {
      pageBlocked = true;
      return "";
    }
    if (!response.ok) return "";
    const html = await response.text();
    const start = html.indexOf(TITLE_MARKER);
    if (start < 0) return "";
    // Recorre el array de "runs" respetando strings para cortarlo exacto y parsearlo como JSON.
    const arrayStart = start + TITLE_MARKER.length;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = arrayStart; index < html.length; index++) {
      const char = html[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "[" || char === "{") depth++;
      else if (char === "]" || char === "}") {
        depth--;
        if (depth === 0) {
          const runs = JSON.parse(html.slice(arrayStart, index + 1)) as Array<{ text?: string }>;
          return runs.map((run) => run.text ?? "").join("").trim();
        }
      }
    }
  } catch {
    // Red caída o página inesperada: quedan el original y los títulos archivados.
  }
  return "";
}

async function main() {
  const archived = loadArchivedTitles();
  const candidates = await prisma.opportunity.findMany({
    where: {
      channel: { name: { contains: "YouTube", mode: "insensitive" } },
      ...(includeDiscarded ? {} : { status: { not: "DISCARDED" } }),
    },
    select: { id: true, sourceUrl: true, sourceText: true, sourceTitle: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  // Los títulos que ya están en español son definitivos.
  const opportunities = candidates.filter((opportunity) => !COMMENT_URL.test(opportunity.sourceUrl)
    && (!usableTitle(opportunity.sourceTitle) || !looksSpanish(opportunity.sourceTitle)));

  console.log(`backfill-youtube-titles: ${opportunities.length} videos sin título o con título que no está en español; ${archived.size} videos en lotes archivados${dryRun ? " (dry-run)" : ""}.`);

  const changes: Array<{ id: string; sourceUrl: string; before: string; after: string }> = [];
  const unresolved: string[] = [];
  let keptOriginal = 0;
  let updated = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < opportunities.length) {
      if (relocalize && pageBlocked) return;
      const opportunity = opportunities[cursor++];
      const stored = usableTitle(opportunity.sourceTitle);
      const original = stored || await fetchYouTubeTitle(opportunity.sourceUrl);
      const alternatives = [...(archived.get(youtubeVideoId(opportunity.sourceUrl)) ?? [])];
      if (relocalize) {
        alternatives.push(await fetchLocalizedTitle(opportunity.sourceUrl));
        await sleep(1500);
      }
      const title = pickYouTubeDisplayTitle({ original, alternatives, sourceText: opportunity.sourceText }).slice(0, 300);
      if (!title) {
        unresolved.push(opportunity.sourceUrl);
        // Un título basura guardado se borra: sin título la UI muestra el texto.
        if (opportunity.sourceTitle && !dryRun) {
          await prisma.opportunity.update({ where: { id: opportunity.id }, data: { sourceTitle: "" } });
          updated += 1;
        }
        continue;
      }
      if (title === opportunity.sourceTitle) {
        keptOriginal += 1;
        continue;
      }
      changes.push({ id: opportunity.id, sourceUrl: opportunity.sourceUrl, before: opportunity.sourceTitle, after: title });
      if (!dryRun) {
        await prisma.opportunity.update({ where: { id: opportunity.id }, data: { sourceTitle: title } });
        updated += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.table(changes.slice(0, 15).map(({ before, after }) => ({ antes: before.slice(0, 55), ahora: after.slice(0, 70) })));

  const report = writeReport("backfill-youtube-titles", {
    command: "backfill-youtube-titles",
    dryRun,
    includeDiscarded,
    relocalize,
    pageBlocked,
    candidates: opportunities.length,
    changed: changes.length,
    keptOriginal,
    updated,
    unresolved,
    changes,
  });
  console.log(`backfill-youtube-titles: ${changes.length} con título nuevo, ${keptOriginal} quedan con el original (sin versión en español conocida), ${unresolved.length} sin resolver${pageBlocked ? ", YouTube bloqueó la página del video (reintentar con --relocalize más tarde)" : ""}, ${dryRun ? "sin cambios" : `${updated} actualizadas`}. Reporte: ${report}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

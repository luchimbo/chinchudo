import { PrismaClient, type Prisma } from "@prisma/client";
// @ts-ignore
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { checkYouTubeAvailability, youtubeVideoId, type YouTubeAvailability } from "../src/lib/source-author";

// Descarta oportunidades de YouTube cuyo video pasó a privado o fue eliminado:
// ya no se pueden responder. Las publicadas se conservan como historial.
// Uso: npx tsx scripts/discard-unavailable-youtube.mts [--dry-run] [--client <slug>]

loadEnv();
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const clientIndex = args.indexOf("--client");
const clientSlug = clientIndex >= 0 ? args[clientIndex + 1] : undefined;
const CONCURRENCY = 4;

async function main() {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] },
      channel: { name: "YouTube" },
      ...(clientSlug ? { client: { slug: clientSlug } } : {}),
    },
    select: { id: true, sourceUrl: true, contextAssessment: true },
  });

  const byVideo = new Map<string, typeof opportunities>();
  for (const opportunity of opportunities) {
    const videoId = youtubeVideoId(opportunity.sourceUrl);
    if (!videoId) continue;
    byVideo.set(videoId, [...(byVideo.get(videoId) ?? []), opportunity]);
  }

  const videoIds = [...byVideo.keys()];
  const results = new Map<string, YouTubeAvailability>();
  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < videoIds.length) {
      const videoId = videoIds[cursor++];
      results.set(videoId, await checkYouTubeAvailability(`https://www.youtube.com/watch?v=${videoId}`));
    }
  }));

  const discarded: Array<{ id: string; sourceUrl: string; availability: YouTubeAvailability }> = [];
  for (const [videoId, availability] of results) {
    if (availability !== "private" && availability !== "removed") continue;
    for (const opportunity of byVideo.get(videoId) ?? []) {
      discarded.push({ id: opportunity.id, sourceUrl: opportunity.sourceUrl, availability });
      if (dryRun) continue;
      const context = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object" && !Array.isArray(opportunity.contextAssessment)
        ? opportunity.contextAssessment as Record<string, unknown>
        : {};
      const copilot = context.copilot && typeof context.copilot === "object" ? context.copilot as Record<string, unknown> : {};
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          status: "DISCARDED",
          contextAssessment: { ...context, copilot: { ...copilot, discardedReason: availability === "private" ? "VIDEO_PRIVADO" : "VIDEO_ELIMINADO", discardedAt: new Date().toISOString() } } as Prisma.InputJsonValue,
        },
      });
    }
  }

  const counts = [...results.values()].reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
  const report = writeReport("discard-unavailable-youtube", { dryRun, clientSlug: clientSlug ?? null, opportunities: opportunities.length, videos: videoIds.length, counts, discarded });
  console.log(`discard-unavailable-youtube: ${videoIds.length} videos revisados ${JSON.stringify(counts)}; ${discarded.length} oportunidades ${dryRun ? "a descartar (dry-run)" : "descartadas"}. Reporte: ${report}`);
  for (const item of discarded) console.log(`  ${item.availability}: ${item.sourceUrl}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

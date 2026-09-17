import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { authorFromUrl, resolveSourceAuthor, storedAuthor } from "../src/lib/source-author";

// Completa Opportunity.sourceAuthor en oportunidades que quedaron sin autor.
// Uso: npx tsx scripts/backfill-source-authors.mts [--dry-run] [--all] [--client <slug>] [--channel YouTube] [--limit N]

loadEnv();
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const includeDiscarded = args.includes("--all");
const argValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const clientSlug = argValue("--client");
const channelName = argValue("--channel");
const limit = Number(argValue("--limit") || 0) || undefined;
const CONCURRENCY = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const client = clientSlug ? await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } }) : null;
  if (clientSlug && !client) throw new Error(`Cliente no encontrado: ${clientSlug}`);

  const opportunities = await prisma.opportunity.findMany({
    where: {
      sourceAuthor: "",
      ...(includeDiscarded ? {} : { status: { not: "DISCARDED" } }),
      ...(client ? { clientId: client.id } : {}),
      ...(channelName ? { channel: { name: channelName } } : {}),
    },
    select: { id: true, sourceUrl: true, channel: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  console.log(`backfill-source-authors: ${opportunities.length} oportunidades sin autor${dryRun ? " (dry-run)" : ""}.`);

  const stats = new Map<string, { total: number; resolved: number }>();
  const examples: Array<{ id: string; channel: string; sourceUrl: string; author: string }> = [];
  let updated = 0;
  let redditFailures = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < opportunities.length) {
      const opportunity = opportunities[cursor++];
      const channel = opportunity.channel.name;
      const stat = stats.get(channel) ?? { total: 0, resolved: 0 };
      stats.set(channel, stat);
      stat.total += 1;

      const isReddit = /reddit/i.test(channel);
      // Reddit bloquea con frecuencia las consultas anónimas: tras varios
      // fallos seguidos se deja de consultar para no demorar el resto.
      const skipNetwork = isReddit && redditFailures >= 5;
      const author = storedAuthor(skipNetwork ? authorFromUrl(channel, opportunity.sourceUrl) : await resolveSourceAuthor(channel, opportunity.sourceUrl));
      if (isReddit && !skipNetwork) {
        redditFailures = author ? 0 : redditFailures + 1;
        await sleep(1200);
      }
      if (!author) continue;

      stat.resolved += 1;
      if (examples.length < 25) examples.push({ id: opportunity.id, channel, sourceUrl: opportunity.sourceUrl, author });
      if (!dryRun) {
        await prisma.opportunity.update({ where: { id: opportunity.id }, data: { sourceAuthor: author } });
        updated += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const byChannel = Object.fromEntries(stats);
  console.table(byChannel);
  console.table(examples.slice(0, 12).map(({ channel, author, sourceUrl }) => ({ channel, author, sourceUrl: sourceUrl.slice(0, 80) })));

  const report = writeReport("backfill-source-authors", { dryRun, includeDiscarded, clientSlug: clientSlug ?? null, candidates: opportunities.length, updated, byChannel, examples });
  console.log(`backfill-source-authors: ${dryRun ? "sin cambios" : `${updated} actualizadas`}. Reporte: ${report}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

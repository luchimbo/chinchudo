import { PrismaClient } from "@prisma/client";
import { KRESSMER_DOMAIN_KEYWORDS, KRESSMER_QUERIES } from "../src/lib/kressmer-radar";
// @ts-ignore shared operational helper
import { loadEnv, writeReport } from "./agent-utils.mjs";
loadEnv();
const db = new PrismaClient();
const dryRun = process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true";
async function main() {
  const client = await db.client.findUniqueOrThrow({ where: { slug: "kressmer" } });
  const settings = { dailyOpportunityTarget: 20, dailyDraftTarget: 20, autoApprove: false, autoPublish: false,
    domainKeywords: JSON.stringify(KRESSMER_DOMAIN_KEYWORDS),
    domainExclusions: JSON.stringify(["gaming keyboard", "computer keyboard", "teclado gamer", "computertastatur"]),
  };
  const sources = KRESSMER_QUERIES.map(({ query, language }, index) => ({
    clientId: client.id, label: `Kressmer YouTube ${language.toUpperCase()} ${index + 1}`, channel: "youtube",
    query, account: "kressmer-early", limit: 40, active: true, lifecycle: "active", priority: 80,
    expectedTopics: ["digital piano", "musical keyboard"], sourceKind: "query",
  }));
  if (!dryRun) await db.$transaction(async tx => {
    await tx.client.update({ where: { id: client.id }, data: settings });
    await tx.monitoredSource.updateMany({ where: { clientId: client.id, channel: { not: "youtube" } }, data: { active: false } });
    for (const source of sources) await tx.monitoredSource.upsert({ where: { label: source.label }, create: source, update: source });
    // A label whose index changed language would otherwise stay active with its old query.
    await tx.monitoredSource.updateMany({ where: { clientId: client.id, label: { notIn: sources.map(source => source.label) } }, data: { active: false } });
  }, { maxWait: 10_000, timeout: 120_000 }); // ~54 sequential upserts over the network exceed Prisma's 5s default.
  const verified = await db.client.findUniqueOrThrow({ where: { id: client.id }, select: {
    dailyOpportunityTarget: true, dailyDraftTarget: true, autoApprove: true, autoPublish: true,
    monitoredSources: { where: { active: true }, select: { label: true, channel: true, query: true, account: true } },
  } });
  const report = writeReport("setup-kressmer-radar", { command: "setup-kressmer-radar", dry_run: dryRun, planned: { settings, sources }, verified });
  console.log(JSON.stringify({ dryRun, verified, report }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
// @ts-ignore shared ESM environment helper.
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { classifyOpportunity } from "../src/lib/ai-opportunity-classifier";
import { calculateOpportunityScore, prestigeFallbackAssessment, priorityFromOpportunityScore } from "../src/lib/contextual-opportunity";

loadEnv();
// La URL pooler de DATABASE_URL evita agotar sesiones durante una pasada masiva.
const prisma = new PrismaClient();
const OPEN = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;
const CLASSIFIER_TIMEOUT_MS = Number(process.env.OPPORTUNITY_CLASSIFIER_TIMEOUT_MS || 120_000);

function argentinaDayStart(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
}

function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, label: string) {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label}: timeout tras ${CLASSIFIER_TIMEOUT_MS}ms`));
    }, CLASSIFIER_TIMEOUT_MS);
    operation(controller.signal).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function parseArgs() {
  const clientAt = process.argv.indexOf("--client");
  const concurrencyAt = process.argv.indexOf("--concurrency");
  const opportunityAt = process.argv.indexOf("--opportunity-id");
  return {
    dryRun: process.argv.includes("--dry-run"),
    draft: process.argv.includes("--draft"),
    retryFallback: process.argv.includes("--retry-fallback"),
    today: process.argv.includes("--today"),
    clientSlug: clientAt >= 0 ? process.argv[clientAt + 1] : "",
    opportunityId: opportunityAt >= 0 ? process.argv[opportunityAt + 1] : "",
    concurrency: Math.min(8, Math.max(1, Number(concurrencyAt >= 0 ? process.argv[concurrencyAt + 1] : process.env.CONTEXTUAL_RECLASSIFY_CONCURRENCY || 6))),
  };
}

async function main() {
  const args = parseArgs();
  const opportunities = await prisma.opportunity.findMany({
    where: {
      ...(!args.opportunityId ? { status: { in: [...OPEN] } } : {}),
      ...(args.opportunityId ? { id: args.opportunityId } : {}),
      ...(!args.opportunityId
        ? (args.retryFallback
          ? { contextAssessment: { path: ["confidence"], equals: "low" } }
          : { contextAssessment: { equals: {} } })
        : {}),
      ...(args.clientSlug ? { client: { slug: args.clientSlug } } : {}),
      ...(args.today ? { createdAt: { gte: argentinaDayStart() } } : {}),
    },
    include: { channel: true, client: true, monitoredSource: { include: { client: true } } },
    orderBy: { createdAt: "desc" },
  });
  let updated = 0;
  let discarded = 0;
  const draftOpportunityIds: string[] = [];
  const errors: string[] = [];
  let cursor = 0;
  async function processOpportunity(opportunity: typeof opportunities[number]) {
    const client = opportunity.client ?? opportunity.monitoredSource?.client;
    if (!client) { errors.push(`${opportunity.id}: sin cliente`); return; }
    try {
      const result = await withTimeout((signal) => classifyOpportunity(prisma, {
        sourceText: opportunity.sourceText,
        sourceTitle: opportunity.notes.slice(0, 1000),
        channel: opportunity.channel.name,
        clientId: client.id,
        signal,
      }), `Clasificador IA ${opportunity.id}`);
      const score = result.opportunityScore ?? calculateOpportunityScore(result.assessment, result.detectedIntent);
      const discard = !result.isRelevant || result.assessment.opportunityType === "discard";
      const priority = priorityFromOpportunityScore(score, result.detectedIntent);
      if (!args.dryRun) await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          detectedIntent: result.detectedIntent,
          priority,
          opportunityScore: score,
          contextAssessment: result.assessment,
          signalType: result.assessment.opportunityType === "contextual_presence" ? "contextual_presence" : opportunity.signalType,
          status: discard ? "DISCARDED" : opportunity.status === "DISCARDED" ? "NEW" : opportunity.status,
          notes: discard ? `${opportunity.notes} [Reclasificación contextual] Descartada: ${result.actionableReason}`.trim() : opportunity.notes,
        },
      });
      updated += 1;
      if (discard) discarded += 1;
      if (!discard && priority !== "LOW") draftOpportunityIds.push(opportunity.id);
    } catch (error) {
      if (client.slug !== "prestige-running") {
        errors.push(`${opportunity.id}: ${(error as Error).message}`);
        return;
      }
      const assessment = prestigeFallbackAssessment(`${opportunity.sourceText} ${opportunity.notes.slice(0, 1000)}`);
      const score = calculateOpportunityScore(assessment, "GENERAL_DISCUSSION");
      const priority = priorityFromOpportunityScore(score, "GENERAL_DISCUSSION");
      if (!args.dryRun) await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          detectedIntent: "GENERAL_DISCUSSION",
          priority,
          opportunityScore: score,
          contextAssessment: assessment,
          signalType: "contextual_presence",
          status: opportunity.status === "DISCARDED" ? "NEW" : opportunity.status,
          notes: `${opportunity.notes} [Reclasificación local Prestige] La IA no respondió dentro de ${CLASSIFIER_TIMEOUT_MS}ms; se conservó la oportunidad por afinidad contextual.`.trim(),
        },
      });
      updated += 1;
      if (priority !== "LOW") draftOpportunityIds.push(opportunity.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, opportunities.length) }, async () => {
    while (cursor < opportunities.length) {
      const opportunity = opportunities[cursor++];
      await processOpportunity(opportunity);
    }
  }));
  if (!args.dryRun && args.draft) {
    for (const opportunityId of draftOpportunityIds) {
      execFileSync("node", [
        "node_modules/tsx/dist/cli.mjs",
        "scripts/draft-worker.mts",
        "--opportunity-id",
        opportunityId,
        "--limit",
        "1",
        "--draft-only",
      ], { cwd: process.cwd(), stdio: "inherit" });
    }
  }
  const report = writeReport("reclassify-contextual", { command: "reclassify-contextual", dry_run: args.dryRun, concurrency: args.concurrency, read: opportunities.length, updated, discarded, drafts_requested: draftOpportunityIds.length, errors });
  await prisma.$disconnect();
  console.log(`reclassify-contextual: ${updated} actualizadas, ${discarded} descartadas. Reporte: ${report}`);
  if (errors.length) process.exitCode = 1;
}

main().catch(async (error) => { await prisma.$disconnect(); console.error(error); process.exit(1); });

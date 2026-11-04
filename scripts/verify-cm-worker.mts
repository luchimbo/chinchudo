import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient();
const expiredLease = process.argv.includes("--expired-lease");
let opportunityId: string | undefined;
const report: Record<string, unknown> = { command: "verify-cm-worker", at: new Date().toISOString(), expiredLease, publishing: false, generation: false };
try {
  const client = await db.client.findUniqueOrThrow({ where: { slug: "pcmidi" }, select: { id: true } });
  const channel = await db.channel.findFirstOrThrow({ where: { name: "YouTube" }, select: { id: true } });
  // A discarded synthetic opportunity cannot reach any LLM or publisher.
  const opportunity = await db.opportunity.create({ data: { clientId: client.id, channelId: channel.id, status: "DISCARDED", sourceUrl: `https://example.invalid/performance/${crypto.randomUUID()}`, sourceText: "Local worker verification only" } });
  opportunityId = opportunity.id;
  const job = await db.cMManualJob.create({ data: { clientId: client.id, requestedBy: "local-verification", opportunityId: opportunity.id, action: "generate", parameters: {}, inputVersion: "verification-conflict", idempotencyKey: crypto.randomUUID(),
    ...(expiredLease ? { status: "RUNNING", attempts: 1, lockedBy: "abandoned-verification-worker", leaseUntil: new Date(Date.now() - 10_000) } : {}) } });
  let state = job.status;
  const deadline = Date.now() + 60_000;
  while (["QUEUED", "RUNNING"].includes(state) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    state = (await db.cMManualJob.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } })).status;
  }
  report.terminalState = state;
  report.attempts = (await db.cMManualJob.findUniqueOrThrow({ where: { id: job.id }, select: { attempts: true } })).attempts;
  const log = await readFile("reports/cm-manual-worker.log", "utf8");
  const events = log.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  report.queueWaitMs = events.find(event => event.operationId === job.id && event.stage === "queue-wait")?.durationMs ?? null;
  report.noDrafts = await db.response.count({ where: { opportunityId: opportunity.id } }) === 0;
  if (state !== "CONFLICT" || (expiredLease && report.attempts !== 2)) process.exitCode = 1;
} finally {
  if (opportunityId) await db.opportunity.delete({ where: { id: opportunityId } });
  report.cleanup = "Only the synthetic opportunity and its cascading job were removed.";
  await writeFile(`reports/module-performance-worker-${expiredLease ? "recovery" : "verification"}.json`, JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));
  await db.$disconnect();
}

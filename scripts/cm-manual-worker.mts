import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import { claimManualJob, runManualJob, workerOwner } from "../src/lib/cm-manual-jobs";
import { refreshCoverageSnapshot } from "../src/lib/cm-coverage-snapshot";
const db = new PrismaClient(), owner = workerOwner();
const tasks = new Set<Promise<void>>();
let coverageTask: Promise<void> | undefined;
let lastCoverageScan = 0;
let stopping = false;
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const dryRun = process.argv.includes("--dry-run");
// @ts-ignore shared ESM reporting helper
import { writeReport } from "./agent-utils.mjs";
writeReport("cm-manual-worker", { command: "cm-manual-worker", dry_run: dryRun, started: new Date().toISOString(), opportunities_created: 0, discarded: 0, errors: [] });
// One worker per PC: the logon shortcut and cm-maintenance.mts may both start one. A local port
// works as a lock that Windows releases when the process dies, even if it is killed.
if (!dryRun) {
  const lock = createServer();
  const alreadyRunning = await new Promise<boolean>(resolve => {
    lock.once("error", () => resolve(true));
    lock.listen(3098, "127.0.0.1", () => { lock.unref(); resolve(false); });
  });
  if (alreadyRunning) { console.info(JSON.stringify({ event: "cm-worker-already-running" })); process.exit(0); }
}
// A dropped pooler connection can leave a Prisma call waiting forever: the process stays alive
// but stops claiming jobs. Exit instead, so cm-maintenance.mts sees the stale heartbeat and
// starts a fresh worker (jobs left RUNNING are re-queued when their lease expires).
let lastTick = Date.now();
const watchdog = dryRun ? undefined : setInterval(() => {
  if (Date.now() - lastTick < 120_000) return;
  console.error(JSON.stringify({ event: "cm-worker-stalled", sinceMs: Date.now() - lastTick }));
  process.exit(1);
}, 30_000);
try {
  do {
    lastTick = Date.now();
    try {
    if (dryRun) { console.info(JSON.stringify({ command: "cm-manual-worker", dryRun: true, queued: await db.cMManualJob.count({ where: { status: "QUEUED" } }) })); break; }
    await db.appSetting.upsert({ where: { key: "cm.manual.worker.heartbeat" }, create: { key: "cm.manual.worker.heartbeat", value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
    while (tasks.size < 2 && !stopping) {
      const job = await claimManualJob(db, owner);
      if (!job) break;
      const task = runManualJob(db, job, owner).catch(() => console.error("[cm-worker] job-state-write-failed")).finally(() => tasks.delete(task));
      tasks.add(task);
    }
    if (!coverageTask && Date.now() - lastCoverageScan > 5000) {
      lastCoverageScan = Date.now();
      coverageTask = (async () => {
        const snapshots = await db.cMCoverageSnapshot.findMany({ where: { requestedAt: { gte: new Date(Date.now() - 300_000) } } });
        const next = snapshots.filter(snapshot => snapshot.invalidatedAt > snapshot.calculatedAt || Date.now() - snapshot.calculatedAt.getTime() > 30_000).sort((a,b) => a.calculatedAt.getTime() - b.calculatedAt.getTime())[0];
        if (next) await refreshCoverageSnapshot(db, next.clientId);
      })().catch(() => console.error("[cm-worker] coverage-refresh-failed")).finally(() => { coverageTask = undefined; });
    }
    } catch (error) {
      console.error(JSON.stringify({ event: "cm-worker-retry", code: (error as { code?: string }).code || "unavailable" }));
      if (!stopping) await sleep(5000);
    }
    if (!stopping) await sleep(2000);
  } while (!stopping);
} finally { if (watchdog) clearInterval(watchdog); await Promise.allSettled([...tasks, ...(coverageTask ? [coverageTask] : [])]); await db.$disconnect(); }

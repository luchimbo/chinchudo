import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { runCMMaintenance } from "../src/lib/cm-maintenance";
// @ts-ignore shared ESM helper.
import { loadEnv, writeReport } from "./agent-utils.mjs";

loadEnv();
const db = new PrismaClient();
const owner = randomUUID();
const lockKey = "cm.maintenance.run-lock";
const leaseMs = 15 * 60_000;
let locked = false;
let leaseValue = "";
let heartbeat: ReturnType<typeof setInterval> | undefined;

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function positive(value: string | undefined, fallback: number) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 10_000) throw new Error("Los límites deben ser enteros entre 1 y 10000.");
  return number;
}

async function main() {
  const options = {
    limit: positive(option("--limit") ?? process.env.CM_DRAFT_BATCH_LIMIT, 10),
    dailyLimit: positive(option("--daily-limit") ?? process.env.CM_DRAFT_DAILY_LIMIT, 200),
    clientSlug: option("--client"), dryRun: process.argv.includes("--dry-run"),
  };
  if (!options.dryRun) {
    await db.appSetting.upsert({ where: { key: lockKey }, create: { key: lockKey, value: "{}" }, update: {} });
    const previous = await db.appSetting.findUniqueOrThrow({ where: { key: lockKey } });
    let expiresAt = 0;
    try { expiresAt = Number(JSON.parse(previous.value).expiresAt) || 0; } catch { /* Legacy lock. */ }
    if (expiresAt > Date.now()) {
      writeReport("cm-maintenance", { command: "cm-maintenance", dry_run: false, options, skipped: "run_in_progress" });
      console.log("Asistente CM: ya hay una actualización en curso.");
      return;
    }
    leaseValue = JSON.stringify({ owner, expiresAt: Date.now() + leaseMs });
    const claim = await db.appSetting.updateMany({ where: { key: lockKey, value: previous.value }, data: { value: leaseValue } });
    if (!claim.count) {
      writeReport("cm-maintenance", { command: "cm-maintenance", dry_run: false, options, skipped: "lock_taken" });
      return;
    }
    locked = true;
    // Fixed owner value permits a heartbeat and compare-and-swap release without stealing another run.
    heartbeat = setInterval(async () => {
      const next = JSON.stringify({ owner, expiresAt: Date.now() + leaseMs });
      try {
        const renewal = await db.appSetting.updateMany({ where: { key: lockKey, value: leaseValue }, data: { value: next } });
        if (renewal.count) leaseValue = next;
      } catch { /* Lease expires on persistent database failure. */ }
    }, 30_000);
  }
  const results = await runCMMaintenance(db, options);
  const failed = results.some((result) => result.outcomes.some((outcome) => outcome.status === "error"));
  const report = writeReport("cm-maintenance", { command: "cm-maintenance", dry_run: options.dryRun, options, results });
  console.log(`Asistente CM: ${options.dryRun ? "simulación" : "actualización"} ${failed ? "con errores" : "completada"}. Reporte: ${report}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeReport("cm-maintenance", { command: "cm-maintenance", errors: [message] });
  console.error(message);
  process.exitCode = 1;
}).finally(async () => {
  if (heartbeat) clearInterval(heartbeat);
  if (locked) await db.appSetting.updateMany({ where: { key: lockKey, value: leaseValue }, data: { value: "{}" } });
  await db.$disconnect();
});

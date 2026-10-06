import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv, writeReport, timestamp } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const clientArg = process.argv.indexOf("--client");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit debe ser un entero positivo");
if (clientArg >= 0 && (!process.argv[clientArg + 1] || process.argv[clientArg + 1].startsWith("--"))) throw new Error("--client requiere el identificador del cliente");

async function main() {
  const sources = await prisma.monitoredSource.findMany({
    where: { active: true, lastError: { not: "" }, ...(clientArg >= 0 ? { client: { slug: process.argv[clientArg + 1] } } : {}) },
    select: { id: true, clientId: true, channel: true, query: true, limit: true, lastError: true, updatedAt: true },
    orderBy: { id: "asc" }, take: limit,
  });
  await mkdir("runtime", { recursive: true });
  await mkdir("reports", { recursive: true });
  const runId = timestamp();
  const snapshot = join(process.cwd(), "runtime", `${runId}-listener-recheck-snapshot.json`);
  const evidence = join(process.cwd(), "reports", `${runId}-listener-recheck-evidence.jsonl`);
  await writeFile(snapshot, JSON.stringify(sources, null, 2));
  const child = spawn(process.env.LISTENING_PYTHON_BIN || "python", ["agents/recheck-listening-sources.py", snapshot], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  const completion = new Promise((resolve) => { child.on("error", (error) => { stderr = error.message; resolve(-1); }); child.on("close", (code) => resolve(code)); });
  const originals = new Map(sources.map((source) => [source.id, source]));
  const results = [];
  let fatalError = "";
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      const check = JSON.parse(line);
      const original = originals.get(check.id);
      if (!original || check.query !== original.query || check.channel !== original.channel) throw new Error("La evidencia no coincide con la fuente");
      await appendFile(evidence, `${JSON.stringify(check)}\n`);
      const success = check.health.status === "ok";
      let changed = 0;
      if (!dryRun) {
        // No pisar una corrida/configuración que cambió durante la comprobación.
        const result = await prisma.monitoredSource.updateMany({
          where: { id: original.id, active: true, updatedAt: original.updatedAt, query: original.query, lastError: original.lastError },
          data: { lastError: success ? "" : `searxng: ${check.health.error || check.health.status}`.slice(0, 2000), blockedReason: success ? "" : "La búsqueda no pudo completarse" },
        });
        changed = result.count;
      }
      results.push({ ...check, clientId: original.clientId, previousError: original.lastError, success, changed });
      if (results.length % 10 === 0 || results.length === sources.length) console.log(`${results.length}/${sources.length}: ${results.filter((r) => r.success).length} búsquedas respondieron; ${results.filter((r) => r.success && r.changed).length} errores resueltos.`);
    }
  } catch (error) {
    fatalError = error.message;
    child.kill();
  }
  const exitCode = await completion;
  const report = writeReport("listener-error-recheck", { command: "recheck-listening-errors", dryRun, sourcesRead: sources.length, checked: results.length, resolved: results.filter((r) => r.success && r.changed).length, stillFailing: results.filter((r) => !r.success).length, skippedConcurrentChanges: results.filter((r) => !dryRun && !r.changed).length, opportunitiesCreated: 0, evidence, results, error: fatalError || (exitCode === 0 ? "" : stderr || `Python exit ${exitCode}`) });
  console.log(`Reporte: ${report}`);
  if (fatalError) throw new Error(fatalError);
  if (exitCode !== 0) throw new Error(stderr || `Python exit ${exitCode}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

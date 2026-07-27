import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

const EMPTY_READ_LIMIT = Number(process.env.RADAR_SOURCE_EMPTY_LIMIT || 5);
const QUERY_TIMEOUT_MS = Number(process.env.RADAR_SOURCE_QUERY_TIMEOUT_MS || 15_000);

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = QUERY_TIMEOUT_MS) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${timeoutMs}ms`)), timeoutMs);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function disconnect() {
  try { await withTimeout(prisma.$disconnect(), "Cierre de Prisma", 5_000); } catch { /* forced process exit below */ }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sources = await withTimeout(prisma.monitoredSource.findMany({ where: { active: true }, select: { id: true, label: true, channel: true, lastRunAt: true, lastCount: true, emptyReads: true, lifecycle: true, blockedReason: true } }), "Lectura de fuentes");
  const result = [];
  for (const source of sources) {
    let lifecycle = source.lifecycle;
    let reason = source.blockedReason;
    if (!source.lastRunAt) { lifecycle = "proposed"; reason = "Sin lectura todavía"; }
    else if (source.emptyReads >= EMPTY_READ_LIMIT) { lifecycle = "exhausted"; reason = `Sin evidencia en ${source.emptyReads} lecturas`; }
    else if (source.lastCount > 0) { lifecycle = "active"; reason = ""; }
    if (!dryRun && (lifecycle !== source.lifecycle || reason !== source.blockedReason)) await withTimeout(prisma.monitoredSource.update({ where: { id: source.id }, data: { lifecycle, blockedReason: reason } }), `Actualizacion de ${source.label}`);
    result.push({ label: source.label, channel: source.channel, lifecycle, emptyReads: source.emptyReads, reason });
  }
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const reportPath = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-validate-sources.json`);
  await writeFile(reportPath, JSON.stringify({ command: "validate-sources", dryRun, emptyReadLimit: EMPTY_READ_LIMIT, sources: result }, null, 2));
  console.log(JSON.stringify({ sources: result, reportPath }, null, 2));
  await disconnect();
}
main().catch(async (error) => { console.error(error); await disconnect(); process.exit(1); });

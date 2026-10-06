import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();
async function main() {
  const [sourceId, reportPath] = process.argv.slice(2);
  if (!sourceId || !reportPath) throw new Error("Se requiere fuente y reporte de escucha");
  const summary = JSON.parse(await readFile(reportPath, "utf8"));
  if (summary.dry_run) return;
  if (summary.source_id !== sourceId) throw new Error("El reporte no corresponde a la fuente");
  const startedAt = new Date(summary.started_at);
  if (!Number.isFinite(startedAt.getTime()) || !Array.isArray(summary.providers)) throw new Error("Reporte incompleto");
  if (!summary.error && !summary.items_read && !summary.providers.some((provider) => provider.status === "ok")) {
    console.log(JSON.stringify({ sourceId, updated: 0, reason: "Sin evidencia de una búsqueda completada" }));
    return;
  }
  const result = await prisma.monitoredSource.updateMany({
    where: { id: sourceId, active: true, query: summary.query, channel: summary.channel, OR: [{ lastRunAt: null }, { lastRunAt: { lte: startedAt } }] },
    data: {
      lastRunAt: new Date(), lastItemsRead: summary.items_read,
      lastCandidates: summary.intake_rows, lastDiscarded: summary.discarded_count,
      lastError: String(summary.error || "").slice(0, 2000), lastDiscoveryMode: summary.discovery_mode,
      blockedReason: summary.error ? "La búsqueda no pudo completarse" : "",
    },
  });
  console.log(JSON.stringify({ sourceId, updated: result.count }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

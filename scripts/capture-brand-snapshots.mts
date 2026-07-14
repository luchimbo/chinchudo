import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { SNAPSHOT_CLIENT_SLUGS, SNAPSHOT_MILESTONES, argentinaNoon, asSnapshotMetrics, collectSnapshotMetrics, metricDelta, scheduleForMilestone, type SnapshotMetrics } from "../src/lib/brand-snapshots";

const prisma = new PrismaClient();
const root = process.cwd();
const reportsDir = join(root, "reports");
const exportsDir = join(root, "exports");
const args = new Set(process.argv);
const dryRun = args.has("--dry-run");
const bootstrap = args.has("--bootstrap");
const refreshReports = args.has("--refresh-reports");
const now = new Date();
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const stamp = (date: Date) => date.toISOString().replace(/[:.]/g, "-");

function rows(metrics: SnapshotMetrics) {
  return Object.entries(metrics).flatMap(([section, values]) => Object.entries(values).map(([metric, value]) => ({ section, metric, value })));
}

function writeCsv(clientSlug: string, milestone: string, metrics: SnapshotMetrics, deltas: SnapshotMetrics) {
  mkdirSync(exportsDir, { recursive: true });
  const path = join(exportsDir, `brand-snapshot-${clientSlug}-${milestone}-${stamp(now)}.csv`);
  const content = ["section,metric,value,delta_d0", ...rows(metrics).map((row) => [row.section, row.metric, row.value, deltas[row.section as keyof SnapshotMetrics][row.metric] ?? 0].map(csvCell).join(","))].join("\n") + "\n";
  writeFileSync(path, content, "utf8");
  return path;
}

function writePdf(clientName: string, clientSlug: string, milestone: string, baselineAt: Date, metrics: SnapshotMetrics, deltas: SnapshotMetrics) {
  mkdirSync(reportsDir, { recursive: true });
  const path = join(reportsDir, `brand-snapshot-${clientSlug}-${milestone}-${stamp(now)}.pdf`);
  const input = join(reportsDir, `.brand-snapshot-${clientSlug}-${milestone}.json`);
  const labels: Record<string, string> = { configuration: "Configuracion", funnel: "Embudo operativo", landings: "Landings y leads", tracking: "Tracking interno" };
  const payload = { clientName, milestone, capturedAt: now.toISOString(), baselineAt: baselineAt.toISOString(), deltas, sections: Object.fromEntries(Object.entries(metrics).map(([key, values]) => [labels[key], Object.entries(values).map(([metric, value]) => [key, metric, value])])) };
  writeFileSync(input, JSON.stringify(payload), "utf8");
  try { execFileSync("python", [join(root, "scripts", "generate-brand-snapshot-pdf.py"), input, path], { stdio: "pipe" }); }
  finally { if (existsSync(input)) unlinkSync(input); }
  return path;
}

async function capture(client: { id: string; name: string; slug: string }) {
  const existing = await prisma.brandSnapshot.findMany({ where: { clientId: client.id }, orderBy: { capturedAt: "asc" } });
  const baseline = existing.find((snapshot) => snapshot.milestone === "D0");
  // La primera pasada diaria inicializa D0; --bootstrap queda como alias explícito para operación manual.
  const baselineAt = baseline?.baselineAt ?? argentinaNoon(now);
  const due = SNAPSHOT_MILESTONES.find((milestone) => !existing.some((snapshot) => snapshot.milestone === milestone) && (milestone === "D0" || scheduleForMilestone(baselineAt, milestone) <= now));
  if (!due) {
    if (!refreshReports) return { client: client.slug, action: "up_to_date" };
    const latest = existing.at(-1)!;
    const metrics = asSnapshotMetrics(latest.metrics);
    const deltas = asSnapshotMetrics(latest.deltas);
    if (dryRun) return { client: client.slug, action: "would_refresh_reports", milestone: latest.milestone };
    const csvPath = writeCsv(client.slug, latest.milestone, metrics, deltas);
    const pdfPath = writePdf(client.name, client.slug, latest.milestone, latest.baselineAt, metrics, deltas);
    await prisma.brandSnapshot.update({ where: { id: latest.id }, data: { csvPath, pdfPath } });
    return { client: client.slug, action: "reports_refreshed", milestone: latest.milestone, csvPath, pdfPath };
  }
  const metrics = await collectSnapshotMetrics(prisma, client.id);
  const baselineMetrics = due === "D0" ? metrics : asSnapshotMetrics(baseline!.metrics);
  const deltas = due === "D0" ? metricDelta(metrics, metrics) : metricDelta(metrics, baselineMetrics);
  if (dryRun) return { client: client.slug, action: "would_capture", milestone: due, metrics };
  const csvPath = writeCsv(client.slug, due, metrics, deltas);
  const pdfPath = writePdf(client.name, client.slug, due, baselineAt, metrics, deltas);
  await prisma.brandSnapshot.create({ data: { clientId: client.id, milestone: due, baselineAt, scheduledFor: scheduleForMilestone(baselineAt, due), metrics, deltas, csvPath, pdfPath } });
  return { client: client.slug, action: "captured", milestone: due, csvPath, pdfPath };
}

async function main() {
  const clients = await prisma.client.findMany({ where: { slug: { in: [...SNAPSHOT_CLIENT_SLUGS] } }, select: { id: true, name: true, slug: true } });
  if (clients.length !== SNAPSHOT_CLIENT_SLUGS.length) throw new Error("Faltan Jurispedia o Prestige; no se puede crear una linea base comun.");
  const results = [];
  for (const client of clients) results.push(await capture(client));
  const report = { command: "brand-snapshots", dryRun, bootstrap, refreshReports, at: now.toISOString(), results };
  if (!dryRun) {
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, `brand-snapshot-run-${stamp(now)}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}
main().finally(() => prisma.$disconnect());

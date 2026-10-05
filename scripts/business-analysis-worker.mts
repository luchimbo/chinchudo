import { prisma } from "../src/lib/db";
import { runBusinessAnalysisQueue } from "../src/lib/business-analysis-worker";
import { enqueueBusinessAnalysis } from "../src/lib/business-analysis-service";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.includes("--client") ? args[args.indexOf("--client") + 1] : undefined;
  const dryRun = args.includes("--dry-run");
  if (dryRun) {
    const [runs, due] = await Promise.all([
      prisma.businessAnalysisRun.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] }, ...(slug ? { client: { slug } } : {}) }, select: { id: true, clientId: true, stage: true, status: true } }),
      prisma.businessProfile.findMany({ where: { monthlyEnabled: true, nextAnalysisAt: { lte: new Date() }, client: { active: true, ...(slug ? { slug } : {}) } }, select: { clientId: true, nextAnalysisAt: true } }),
    ]);
    console.log(JSON.stringify({ command: "business-analysis", date: new Date().toISOString(), dryRun: true, runs, due, writes: 0 }));
    return;
  }
  let clientId: string | undefined;
  if (slug) {
    const client = await prisma.client.findUniqueOrThrow({ where: { slug } });
    clientId = client.id;
    await enqueueBusinessAnalysis(prisma, client);
  }
  const runs = await runBusinessAnalysisQueue(prisma, clientId);
  const report = { command: "business-analysis", date: new Date().toISOString(), dryRun: false, runs, skipped: !runs.length };
  if (runs.length) {
    await mkdir(join(process.cwd(), "reports"), { recursive: true });
    await writeFile(join(process.cwd(), "reports", `business-analysis-${Date.now()}-${randomUUID()}.json`), JSON.stringify(report, null, 2), "utf8");
  }
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falló el worker de análisis."); process.exitCode = 1; }).finally(() => prisma.$disconnect());

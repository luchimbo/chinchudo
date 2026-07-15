import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
// @ts-ignore -- shared operational environment loader.
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

type Source = { id: string; label: string; channel: string; query: string; account: string; limit: number; lastRunAt: Date | null };

function argentinaDayStart(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
}

function run(command: string, args: string[], timeoutMs = 90_000) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
    const child = spawn(executable, args, { cwd: process.cwd(), env: process.env, shell: false, windowsHide: true });
    let output = "";
    let settled = false;
    const finish = (code: number | null, suffix = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output: `${output}${suffix}` });
    };
    const timer = setTimeout(() => { child.kill(); finish(-1, `\nTimeout tras ${timeoutMs}ms`); }, timeoutMs);
    child.stdout.on("data", (chunk) => output += chunk.toString());
    child.stderr.on("data", (chunk) => output += chunk.toString());
    child.on("close", (code) => finish(code));
    child.on("error", (error) => finish(-1, error.message));
  });
}

async function newCount(clientId: string, since: Date) {
  return prisma.opportunity.count({ where: { clientId, createdAt: { gte: since }, status: { not: "DISCARDED" } } });
}

async function main() {
  const clientSlug = process.argv.find((arg, index) => process.argv[index - 1] === "--client") || "";
  const overrideTarget = Number(process.argv.find((arg, index) => process.argv[index - 1] === "--target") || 0);
  const since = argentinaDayStart();
  const clients = await prisma.client.findMany({ where: { active: true, ...(clientSlug ? { slug: clientSlug } : {}) }, select: { id: true, slug: true, dailyOpportunityTarget: true, opportunitySearchState: true } });
  const report: Array<Record<string, unknown>> = [];

  for (const client of clients) {
    const target = Math.max(1, overrideTarget || client.dailyOpportunityTarget || 15);
    const sources = await prisma.monitoredSource.findMany({ where: { clientId: client.id, active: true }, orderBy: [{ lastRunAt: "asc" }, { label: "asc" }] }) as Source[];
    let count = await newCount(client.id, since);
    const attempts: Array<Record<string, unknown>> = [];
    let cursor = Number((client.opportunitySearchState as { cursor?: number })?.cursor ?? 0);

    while (count < target && sources.length > 0 && attempts.length < sources.length * 3) {
      const source = sources[cursor % sources.length];
      cursor += 1;
      console.log(`Buscando ${client.slug}: ${source.channel} · ${source.label} (${count}/${target})`);
      const listen = await run("python", ["agents/social-listen.py", "--channel", source.channel, "--query", source.query, "--account", source.account || "", "--limit", String(Math.max(source.limit, 12)), "--source-id", source.id, "--client-id", client.id, "--language", "es"]);
      const imported = listen.code === 0 ? await run("npx", ["tsx", "scripts/import-opportunities.mts"]) : { code: null, output: "Importación omitida por fallo de escucha." };
      count = await newCount(client.id, since);
      attempts.push({ source: source.label, channel: source.channel, listenCode: listen.code, importCode: imported.code, totalNew: count, error: listen.code === 0 ? "" : listen.output.slice(-500) });
    }

    await prisma.client.update({ where: { id: client.id }, data: { opportunitySearchState: { cursor, lastRunAt: new Date().toISOString(), lastTarget: target, lastCount: count, attempts } } });
    report.push({ client: client.slug, target, newOpportunities: count, complete: count >= target, attempts });
  }
  const payload = { command: "daily-opportunity-quota", since: since.toISOString(), clients: report };
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const reportPath = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-daily-opportunity-quota.json`);
  await writeFile(reportPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ...payload, reportPath }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });

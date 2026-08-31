import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { operationalOpportunityWhere } from "../src/lib/opportunity-channels";
// @ts-ignore -- shared ESM helper used by operational scripts.
import { loadEnv } from "./agent-utils.mjs";

loadEnv();

const DEFAULT_DAILY_TARGET = 50;
// 0 significa sin corte: los modelos lentos pueden terminar la generación.
const DRAFT_TIMEOUT_MS = Number(process.env.DAILY_DRAFT_TIMEOUT_MS || 0);

function argentinaDayStart(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] || "";
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function runDraft(client: string, limit: number, dryRun: boolean) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const args = [join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/draft-worker.mts", "--client", client, "--limit", String(limit), "--copilot"];
    if (dryRun) args.push("--dry-run");
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, shell: false, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => output += chunk.toString());
    child.stderr.on("data", (chunk) => output += chunk.toString());
    const timeout = DRAFT_TIMEOUT_MS > 0 ? setTimeout(() => child.kill(), DRAFT_TIMEOUT_MS) : null;
    child.on("close", (code) => { if (timeout) clearTimeout(timeout); resolve({ code, output }); });
    child.on("error", (error) => { if (timeout) clearTimeout(timeout); resolve({ code: -1, output: error.message }); });
  });
}

async function main() {
  const target = Math.max(1, Number(option("--target")) || DEFAULT_DAILY_TARGET);
  const dryRun = process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true";
  const since = argentinaDayStart();
  const clients = await prisma.client.findMany({ where: { active: true }, select: { id: true, slug: true, name: true, dailyDraftTarget: true } });
  const results = await Promise.all(clients.map(async (client) => {
    const clientTarget = Math.max(1, Number(option("--target")) || client.dailyDraftTarget || target);
    const draftedToday = await prisma.response.findMany({
      where: { createdAt: { gte: since }, opportunity: { clientId: client.id, ...operationalOpportunityWhere() } },
      distinct: ["opportunityId"],
      select: { opportunityId: true },
    });
    const remaining = Math.max(0, clientTarget - draftedToday.length);
    if (!remaining) {
      return { client: client.slug, target: clientTarget, opportunities_drafted_today: draftedToday.length, requested: 0, status: "quota_reached" };
    }
    const run = await runDraft(client.slug, remaining, dryRun);
    const created = Number(run.output.match(/draft-worker:\s+(\d+)\s+borradores/i)?.[1] || 0);
    const status = run.code === 0 ? "ok" : "failed";
    return { client: client.slug, target: clientTarget, opportunities_drafted_today: draftedToday.length, requested: remaining, drafts_created: created, status, output: run.output.trim().slice(-2000) };
  }));
  const failed = results.some((result) => result.status === "failed");

  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const report = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-daily-draft-quota.json`);
  await writeFile(report, JSON.stringify({ command: "daily-draft-quota", dry_run: dryRun, target_per_client: target, since: since.toISOString(), results }, null, 2));
  await prisma.$disconnect();
  console.log(`daily-draft-quota: ${failed ? "con errores" : "OK"}. Reporte: ${report}`);
  if (failed) process.exit(1);
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});

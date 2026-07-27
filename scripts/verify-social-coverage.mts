import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
// @ts-ignore -- shared operational environment loader.
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const CHANNELS = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "x", "youtube"] as const;
const LISTEN_TIMEOUT_MS = Number(process.env.COVERAGE_LISTEN_TIMEOUT_MS || 45_000);

type Result = { code: number | null; output: string; timedOut: boolean };

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = 20_000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${timeoutMs}ms`)), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function stopProcessTree(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    killer.unref();
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { /* Process already exited. */ }
  }
}

function run(args: string[]): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn("python", args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    let output = "";
    let settled = false;
    const finish = (code: number | null, timedOut = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    };
    const timer = setTimeout(() => {
      stopProcessTree(child.pid);
      output += `\nTimeout tras ${LISTEN_TIMEOUT_MS}ms`;
      finish(-1, true);
    }, LISTEN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => output += chunk.toString());
    child.stderr.on("data", (chunk) => output += chunk.toString());
    child.on("error", (error) => { output += error.message; finish(-1); });
    child.on("close", (code) => finish(code));
  });
}

async function main() {
  const clientSlug = process.argv.find((arg) => arg.startsWith("--client="))?.slice("--client=".length)
    || process.env.npm_config_client
    || "";
  const requestedChannels = process.argv.find((arg) => arg.startsWith("--channels="))?.slice("--channels=".length)
    .split(",").map((channel) => channel.trim()).filter((channel): channel is typeof CHANNELS[number] => CHANNELS.includes(channel as typeof CHANNELS[number]));
  const channels = requestedChannels?.length ? requestedChannels : CHANNELS;
  const clients = await withTimeout(prisma.client.findMany({
    where: { active: true, ...(clientSlug ? { slug: clientSlug } : {}) },
    select: { id: true, slug: true, monitoredSources: { where: { active: true }, orderBy: { lastRunAt: "asc" }, select: { id: true, channel: true, query: true, account: true } } },
  }), "Lectura de clientes");
  const results: Array<Record<string, unknown>> = [];
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const reportPath = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-verify-social-coverage.json`);
  const saveReport = async (finished: boolean) => {
    await writeFile(reportPath, JSON.stringify({
      command: "verify-social-coverage",
      dryRun: true,
      finished,
      clients: clients.map((client) => client.slug),
    requiredChannels: channels,
      results,
    }, null, 2));
  };
  await saveReport(false);

  for (const client of clients) {
    for (const channel of channels) {
      const source = client.monitoredSources.find((item) => item.channel === channel);
      if (!source) {
        results.push({ client: client.slug, channel, status: "missing_source", found: 0 });
        await saveReport(false);
        continue;
      }
      console.log(`Probando ${client.slug}: ${channel}`);
      const args = ["agents/social-listen.py", "--channel", channel, "--query", source.query, "--limit", "15", "--source-id", source.id, "--client-id", client.id, "--language", "es", "--dry-run", "--output-json"];
      if (source.account?.trim()) args.push("--account", source.account);
      const result = await run(args);
      let parsed: { rows?: unknown[]; summary?: Record<string, unknown> } | null = null;
      try { parsed = JSON.parse(result.output); } catch { /* Preserve the tail for diagnostics. */ }
      results.push({
        client: client.slug,
        channel,
        status: result.timedOut ? "timeout" : result.code === 0 ? "ok" : "failed",
        found: parsed?.rows?.length || 0,
        itemsRead: parsed?.summary?.items_read || 0,
        error: result.code === 0 ? "" : result.output.slice(-800),
      });
      await saveReport(false);
    }
  }

  await saveReport(true);
  console.log(JSON.stringify({ reportPath, results }, null, 2));
  await withTimeout(prisma.$disconnect(), "Cierre de Prisma", 5_000);
}

main().catch(async (error) => { console.error(error); try { await withTimeout(prisma.$disconnect(), "Cierre de Prisma", 5_000); } catch { /* Preserve the error exit. */ } process.exit(1); });

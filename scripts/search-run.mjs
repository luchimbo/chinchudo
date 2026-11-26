// Manual opportunity search (POST /search/run), shared by the PC relay (agent-relay.mjs) and the
// pcmidi server (blog-runtime-service.mjs). Runs social-listen.py per channel into its own intake
// file, imports it, and streams NDJSON progress events the web shows while it works.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_CHANNEL_TIMEOUT_MS = 90_000;

function pythonCommand() {
  if (process.env.AGENTS_PYTHON_BIN) return { command: process.env.AGENTS_PYTHON_BIN, argsPrefix: [] };
  if (process.platform !== "win32" && (process.env.PYTHON_BIN || process.env.PYTHON)) {
    return { command: process.env.PYTHON_BIN || process.env.PYTHON, argsPrefix: [] };
  }
  const local = process.platform === "win32" ? join(ROOT, ".venv", "Scripts", "python.exe") : join(ROOT, ".venv", "bin", "python");
  if (existsSync(local)) return { command: local, argsPrefix: [] };
  if (process.platform === "win32" && existsSync("C:\\Python313\\python.exe")) return { command: "C:\\Python313\\python.exe", argsPrefix: [] };
  return { command: "python", argsPrefix: [] };
}

function commandName(name) {
  if (name === "python") return pythonCommand();
  if (process.platform !== "win32") return { command: name, argsPrefix: [] };
  return { command: "cmd.exe", argsPrefix: ["/d", "/s", "/c", name === "npx" ? "npx.cmd" : "python.exe"] };
}

function runProcess(commandConfig, args, onLine, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", settled = false, timedOut = false, timer = null, child = null;
    const finish = (code) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); };
    try {
      child = spawn(commandConfig.command, [...commandConfig.argsPrefix, ...args], { cwd: ROOT, env: process.env, windowsHide: true });
      if (timeoutMs) {
        timer = setTimeout(() => {
          timedOut = true;
          stderr = `${stderr}\nTimeout tras ${timeoutMs}ms`;
          child?.kill("SIGTERM");
          setTimeout(() => { if (!settled) child?.kill("SIGTERM"); }, 2_000);
        }, timeoutMs);
      }
      const collect = (chunk, stream) => {
        const text = chunk.toString();
        if (stream === "stdout") stdout += text; else stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line, stream);
      };
      child.stdout.on("data", (chunk) => collect(chunk, "stdout"));
      child.stderr.on("data", (chunk) => collect(chunk, "stderr"));
      child.on("close", (code) => finish(code));
      child.on("error", (error) => { stderr = `${stderr}\n${error.message}`; finish(-1); });
    } catch (error) {
      stderr = `${stderr}\n${error instanceof Error ? error.message : String(error)}`;
      finish(-1);
    }
  });
}

export function extractLastJson(stdout) {
  const first = stdout.indexOf("{"), last = stdout.lastIndexOf("}");
  if (first < 0 || last < first) return null;
  try { return JSON.parse(stdout.slice(first, last + 1)); } catch { return null; }
}

export function parseImportSummary(stdout) {
  const processed = stdout.match(/import-opportunities:\s+(\d+)\s+procesadas/i);
  const discarded = stdout.match(/\((\d+)\s+de ellas auto-descartadas\)/i);
  const duplicates = stdout.match(/,\s+(\d+)\s+duplicadas/i);
  return {
    createdOrProcessed: processed ? Number(processed[1]) : 0,
    discardedAtImport: discarded ? Number(discarded[1]) : 0,
    duplicates: duplicates ? Number(duplicates[1]) : 0,
    raw: stdout.trim().slice(-1000),
  };
}

/** `body` is the already-parsed request JSON; `json(res, status, body)` writes a plain response. */
export async function handleSearchRun(body, res, json) {
  const { clientId, channels, query, language, limit } = body || {};
  if (!clientId || !Array.isArray(channels) || channels.length === 0 || typeof query !== "string" || !query.trim()) {
    return json(res, 400, { error: "missing_fields" });
  }
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
  const send = (event) => { res.write(`${JSON.stringify(event)}\n`); };
  const totals = { itemsRead: 0, intakeRows: 0, createdOrProcessed: 0, duplicates: 0, discarded: 0, completedChannels: 0, timedOutChannels: 0, errors: 0 };
  try {
    send({ status: "started", message: "Busqueda iniciada.", data: { channels, language, limit, query, suggestions: [] } });
    // Each search owns its intake file: a concurrent monitor run never imports its rows.
    const intake = `runtime/intake/manual-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`;
    for (const channel of channels) {
      send({ status: "channel_started", channel, message: `Buscando en ${channel}...` });
      const listen = await runProcess(commandName("python"), [
        join(ROOT, "agents", "social-listen.py"), "--channel", channel, "--query", query, "--limit", String(limit),
        "--client-id", clientId, "--language", language || "es", "--intake-path", intake,
      ], (line, stream) => { if (stream === "stderr" && line.includes("ERROR")) send({ status: "error", channel, message: line.slice(0, 500) }); }, SEARCH_CHANNEL_TIMEOUT_MS);
      if (listen.timedOut) {
        totals.timedOutChannels += 1;
        send({ status: "channel_timeout", channel, message: `${channel} tardo demasiado. Pasando a la siguiente red.`, data: { timeoutMs: SEARCH_CHANNEL_TIMEOUT_MS } });
        continue;
      }
      const listenSummary = extractLastJson(listen.stdout);
      if (listen.code !== 0 || !listenSummary) {
        totals.errors += 1;
        send({ status: "error", channel, message: listen.stderr.trim() || "No se pudo leer el resumen de escucha.", data: { code: listen.code } });
        continue;
      }
      totals.itemsRead += Number(listenSummary.items_read || 0);
      totals.intakeRows += Number(listenSummary.intake_rows || 0);
      totals.discarded += Number(listenSummary.discarded_count || 0);
      send({ status: "listen_done", channel, message: `${listenSummary.items_read || 0} items leidos, ${listenSummary.intake_rows || 0} candidatos.`, data: listenSummary });
      send({ status: "import_started", channel, message: "Importando oportunidades nuevas..." });
      const imported = await runProcess(commandName("npx"), ["tsx", join(ROOT, "scripts", "import-opportunities.mts"), "--input", intake], () => {});
      const importSummary = parseImportSummary(imported.stdout);
      if (imported.code !== 0) {
        totals.errors += 1;
        send({ status: "error", channel, message: imported.stderr.trim() || importSummary.raw || "Fallo la importacion.", data: { code: imported.code } });
        continue;
      }
      totals.createdOrProcessed += importSummary.createdOrProcessed;
      totals.duplicates += importSummary.duplicates;
      totals.completedChannels += 1;
      send({ status: "import_done", channel, message: `${importSummary.createdOrProcessed} procesadas, ${importSummary.duplicates} duplicadas.`, data: importSummary });
    }
    send({ status: "done", message: totals.createdOrProcessed > 0 ? "Busqueda finalizada." : "No se encontraron oportunidades nuevas.", data: totals });
  } catch (error) {
    totals.errors += 1;
    send({ status: "error", message: error instanceof Error ? error.message : "Error inesperado durante la busqueda." });
    send({ status: "done", message: "Busqueda interrumpida por un error interno.", data: totals });
  } finally {
    res.end();
  }
}

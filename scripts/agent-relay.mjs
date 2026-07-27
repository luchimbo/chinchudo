// Relay server: recibe pedidos de publicacion desde Vercel y los ejecuta localmente
// Exponer con: cloudflared tunnel --url http://127.0.0.1:3099
import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_PATH = join(ROOT, "data", "publish-results.json");

// Cargar .env manualmente (el relay corre fuera de Next.js)
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

const PORT = parseInt(process.env.AGENT_RELAY_PORT ?? "3099", 10);
const TOKEN = process.env.AGENT_RELAY_TOKEN;
const landingGenerationClients = new Set();
const prisma = new PrismaClient();

async function runScheduledLandings() {
  try {
    const settings = await prisma.appSetting.findMany({ where: { key: { startsWith: "landing_generation_schedule:" } } });
    const now = Date.now();
    for (const setting of settings) {
      let schedule;
      try { schedule = JSON.parse(setting.value); } catch { continue; }
      if (!schedule?.enabled) continue;
      const intervalMs = Math.max(1, Math.min(168, Number(schedule.intervalHours) || 24)) * 3_600_000;
      const lastRun = Date.parse(schedule.lastRunAt || "") || 0;
      const windowStart = Date.parse(schedule.dailyWindowStart || "") || now;
      const dailyAttempts = windowStart + 86_400_000 > now ? Number(schedule.dailyAttempts) || 0 : 0;
      if (lastRun + intervalMs > now || dailyAttempts >= 12) continue;
      const clientId = setting.key.replace("landing_generation_schedule:", "");
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true, active: true } });
      if (!client?.active || landingGenerationClients.has(client.slug)) continue;
      landingGenerationClients.add(client.slug);
      schedule.lastRunAt = new Date(now).toISOString();
      schedule.dailyWindowStart = dailyAttempts ? new Date(windowStart).toISOString() : new Date(now).toISOString();
      schedule.dailyAttempts = dailyAttempts + Math.min(5, Math.max(1, Number(schedule.limit) || 3));
      await prisma.appSetting.update({ where: { key: setting.key }, data: { value: JSON.stringify(schedule) } });
      const python = getPythonCommand();
      const child = spawn(python.command, [...python.argsPrefix, join(ROOT, "landing-build", "swarm.py"), "generate", "--limit", String(Math.min(5, Math.max(1, Number(schedule.limit) || 3))), "--client-slug", client.slug], { cwd: ROOT, env: process.env, windowsHide: true });
      child.on("close", (code) => { landingGenerationClients.delete(client.slug); console.log(`[agent-relay] generación programada ${client.slug} finalizó (exit ${code})`); });
      child.on("error", (error) => { landingGenerationClients.delete(client.slug); console.error("[agent-relay] generación programada falló:", error.message); });
      console.log(`[agent-relay] generación programada iniciada para ${client.slug}`);
    }
  } catch (error) {
    console.error("[agent-relay] scheduler de landings:", error instanceof Error ? error.message : error);
  }
}

if (!TOKEN) {
  console.error("[agent-relay] ERROR: AGENT_RELAY_TOKEN no configurado en .env");
  process.exit(1);
}

function authOk(req) {
  return req.headers["authorization"] === `Bearer ${TOKEN}`;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function getPythonCommand() {
  if (process.env.AGENTS_PYTHON_BIN) return { command: process.env.AGENTS_PYTHON_BIN, argsPrefix: [] };

  if (process.platform !== "win32") {
    if (process.env.PYTHON_BIN) return { command: process.env.PYTHON_BIN, argsPrefix: [] };
    if (process.env.PYTHON) return { command: process.env.PYTHON, argsPrefix: [] };
  }

  // On Windows, prefer the system `python` available in PATH before the repo venv.
  // The relay needs the interpreter that already has the DB/preview deps installed.
  if (process.platform === "win32") return { command: "python", argsPrefix: [] };

  const localPython =
    process.platform === "win32"
      ? join(ROOT, ".venv", "Scripts", "python.exe")
      : join(ROOT, ".venv", "bin", "python");

  if (existsSync(localPython)) return { command: localPython, argsPrefix: [] };
  return { command: "python", argsPrefix: [] };
}

async function proxyLocalLlm(req, res) {
  let body;
  try { body = await readBody(req); }
  catch { return json(res, 400, { error: "invalid_json" }); }

  const origin = (process.env.LLM_LOCAL_BASE_URL || process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
  const upstreamKey = process.env.LLM_LOCAL_UPSTREAM_API_KEY || process.env.LLM_API_KEY || "ollama";
  try {
    const upstream = await fetch(`${origin}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    });
    res.end(payload);
  } catch (error) {
    console.error("[agent-relay] LLM upstream failed:", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "local_llm_unavailable" });
  }
}

function commandName(name) {
  if (name === "python") return getPythonCommand();
  if (process.platform !== "win32") return { command: name, argsPrefix: [] };
  const executable = name === "npx" ? "npx.cmd" : "python.exe";
  return { command: "cmd.exe", argsPrefix: ["/d", "/s", "/c", executable] };
}

const SEARCH_CHANNEL_TIMEOUT_MS = 90_000;

function runProcess(commandConfig, args, onLine, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child = null;
    let timer = null;

    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    try {
      const spawned = spawn(commandConfig.command, [...commandConfig.argsPrefix, ...args], {
        cwd: ROOT,
        env: process.env,
        windowsHide: true,
      });
      child = spawned;

      if (timeoutMs) {
        timer = setTimeout(() => {
          timedOut = true;
          stderr = `${stderr}\nTimeout tras ${timeoutMs}ms`;
          child?.kill("SIGTERM");
          setTimeout(() => {
            if (!settled) child?.kill("SIGTERM");
          }, 2_000);
        }, timeoutMs);
      }

      const collect = (chunk, stream) => {
        const text = chunk.toString();
        if (stream === "stdout") stdout += text;
        else stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line, stream);
      };

      spawned.stdout.on("data", (chunk) => collect(chunk, "stdout"));
      spawned.stderr.on("data", (chunk) => collect(chunk, "stderr"));
      spawned.on("close", (code) => finish(code));
      spawned.on("error", (error) => {
        stderr = `${stderr}\n${error.message}`;
        finish(-1);
      });
    } catch (error) {
      stderr = `${stderr}\n${error instanceof Error ? error.message : String(error)}`;
      finish(-1);
    }
  });
}

function extractLastJson(stdout) {
  const first = stdout.indexOf("{");
  const last = stdout.lastIndexOf("}");
  if (first < 0 || last < first) return null;
  try {
    return JSON.parse(stdout.slice(first, last + 1));
  } catch {
    return null;
  }
}

function parseImportSummary(stdout) {
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

// Guarda el resultado de una publicacion en data/publish-results.json
function saveResult(resultKey, result) {
  try {
    const existing = existsSync(RESULTS_PATH)
      ? JSON.parse(readFileSync(RESULTS_PATH, "utf-8"))
      : {};
    existing[resultKey] = { ...result, ts: Date.now() };
    writeFileSync(RESULTS_PATH, JSON.stringify(existing, null, 2), "utf-8");
  } catch (e) {
    console.error("[agent-relay] No se pudo guardar resultado:", e.message);
  }
}

// Testea conectividad con NSTBrowser API
async function testNstbrowser() {
  const apiKey = process.env.NSTBROWSER_API_KEY ?? "";
  const apiBase = (process.env.NSTBROWSER_API_BASE ?? "http://localhost:8848/api/v2").replace(/\/$/, "");
  const result = { apiKeySet: apiKey.length > 0, apiBase, reachable: false, profiles: null, error: null };
  try {
    const { default: http } = await import("node:http");
    const data = await new Promise((resolve, reject) => {
      const req = http.get(`${apiBase.replace("http://", "").split("/")[0]}`.includes(":")
        ? `http://${apiBase.replace("http://", "")}/profiles`
        : `${apiBase}/profiles`,
        { headers: { "x-api-key": apiKey }, timeout: 5000 },
        (res) => {
          let body = "";
          res.on("data", (c) => body += c);
          res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    });
    result.reachable = true;
    result.profiles = Array.isArray(data) ? data.length : data;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // GET /health — sin auth
  if (method === "GET" && url === "/health") {
    return json(res, 200, { ok: true, ts: Date.now() });
  }

  if (!authOk(req)) {
    return json(res, 401, { error: "unauthorized" });
  }

  // POST /v1/chat/completions — proxy autenticado hacia la IA local.
  // El túnel sólo expone este relay, nunca Ollama directamente.
  if (method === "POST" && url === "/v1/chat/completions") {
    return proxyLocalLlm(req, res);
  }

  // GET /debug — diagnostica NSTBrowser y configuracion
  if (method === "GET" && url === "/debug") {
    const nst = await testNstbrowser();
    const accounts = (() => {
      try {
        return Object.keys(JSON.parse(readFileSync(join(ROOT, "agents", "accounts.json"), "utf-8")));
      } catch { return "no disponible"; }
    })();
    return json(res, 200, {
      relay: "ok",
      nstbrowser: nst,
      accounts,
      env: {
        NSTBROWSER_API_KEY: process.env.NSTBROWSER_API_KEY ? "configurada" : "FALTA",
        DATABASE_URL: process.env.DATABASE_URL ? "configurada" : "FALTA",
      }
    });
  }

  // GET /result/:opportunityId — devuelve el ultimo resultado de publicacion
  if (method === "GET" && url.startsWith("/result/")) {
    const opportunityId = url.replace("/result/", "").split("?")[0];
    try {
      const results = existsSync(RESULTS_PATH)
        ? JSON.parse(readFileSync(RESULTS_PATH, "utf-8"))
        : {};
      const entry = results[opportunityId];
      if (!entry) return json(res, 404, { error: "no_result_yet" });
      return json(res, 200, entry);
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  // GET /accounts?channel=<canal>&client=<clientSlug>
  if (method === "GET" && url.startsWith("/accounts")) {
    const parsedUrl = new URL(url, "http://localhost");
    const channel = parsedUrl.searchParams.get("channel") ?? "";
    const client = parsedUrl.searchParams.get("client") ?? "";
    try {
      const accountsPath = join(ROOT, "agents", "accounts.json");
      const raw = JSON.parse(readFileSync(accountsPath, "utf-8"));
      let entries = Object.entries(raw).map(([name, cfg]) => ({
        name,
        label: cfg.label ?? name,
        defaultPersona: cfg.defaultPersona ?? "",
        allowedChannels: cfg.allowedChannels ?? [],
        clientSlug: cfg.clientSlug ?? "",
      }));
      if (channel) {
        entries = entries.filter((e) => e.allowedChannels.includes(channel.toLowerCase()));
      }
      if (client) {
        entries = entries.filter((e) => !e.clientSlug || e.clientSlug === client);
      }
      return json(res, 200, { accounts: entries });
    } catch (err) {
      return json(res, 500, { error: "accounts_read_failed", detail: err.message });
    }
  }

  // GET /login-status — devuelve el último resultado cacheado del chequeo de logins
  if (method === "GET" && url === "/login-status") {
    const p = join(ROOT, "data", "login-status.json");
    if (!existsSync(p)) return json(res, 404, { error: "no_data" });
    try {
      return json(res, 200, JSON.parse(readFileSync(p, "utf-8")));
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  // POST /login-status/run — dispara el chequeo de logins en background (lento ~3-4min)
  if (method === "POST" && url === "/login-status/run") {
    console.log("[agent-relay] login-status: iniciando chequeo en background");
    json(res, 202, { accepted: true });
    execFile("python", [join(ROOT, "agents", "browser-cdp.py"), "login-status"],
      { cwd: ROOT, timeout: 600_000 },
      (err) => {
        if (err) console.error("[agent-relay] login-status fallo:", err.message);
        else console.log("[agent-relay] login-status OK");
      });
    return;
  }

  // POST /publish — responde 202 inmediato, procesa en background
  if (method === "POST" && url === "/publish") {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: "invalid_json" }); }

    const { opportunityId, responseId, account, attemptId } = body;
    if (!opportunityId || !responseId) {
      return json(res, 400, { error: "missing_fields" });
    }

    const args = [
      join(ROOT, "scripts", "publish-response.mjs"),
      "--opportunity-id", opportunityId,
      "--response-id", responseId,
    ];
    if (account) args.push("--account", account);

    const resultKey = attemptId || opportunityId;
    saveResult(resultKey, { pending: true, state: "queued", opportunityId, responseId, account: account ?? "auto", attemptId: resultKey });
    console.log(`[agent-relay] encolando attempt=${resultKey} opp=${opportunityId} resp=${responseId} account=${account ?? "auto"}`);

    // Responder 202 de inmediato
    json(res, 202, { accepted: true, attemptId: resultKey, opportunityId, account: account ?? "auto" });

    // Procesar en background
    execFile("node", args, { cwd: ROOT, encoding: "utf-8", timeout: 180_000 },
      (err, stdout, stderr) => {
        const allOutput = (stdout ?? "") + "\n" + (stderr ?? "");
        const lastLine = (stdout ?? "").trim().split("\n").pop() ?? "{}";
        try {
          const result = JSON.parse(lastLine);
          if (result.success) {
            console.log(`[agent-relay] OK opp=${opportunityId}`, JSON.stringify(result));
            saveResult(resultKey, { pending: false, state: "confirmed", attemptId: resultKey, opportunityId, responseId, account: account ?? "auto", success: true, ...result });
          } else {
            console.warn(`[agent-relay] ERROR opp=${opportunityId} — ${result.error}`);
            saveResult(resultKey, { pending: false, state: "failed", attemptId: resultKey, opportunityId, responseId, account: account ?? "auto", success: false, error: result.error, detail: allOutput.slice(-500) });
          }
        } catch {
          const detail = err?.message || stderr || "spawn_failed";
          console.error(`[agent-relay] FALLO opp=${opportunityId} — ${detail}`);
          console.error("STDOUT:", stdout?.slice(-500));
          console.error("STDERR:", stderr?.slice(-500));
          saveResult(resultKey, { pending: false, state: "failed", attemptId: resultKey, opportunityId, responseId, account: account ?? "auto", success: false, error: "spawn_failed", detail: allOutput.slice(-500) });
        }
      }
    );
    return; // ya respondimos 202
  }

  // POST /landings/preview — ejecuta build_landings.py localmente y devuelve el HTML
  if (method === "POST" && url === "/landings/preview") {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: "invalid_json" }); }

    const { clientSlug, landingId, blogBaseUrl, clientConfig } = body;
    console.log("[agent-relay] landings/preview", {
      clientSlug,
      landingId,
      blogBaseUrl,
      clientConfigSlug: clientConfig?.slug,
      clientConfigId: clientConfig?.id,
    });
    if (!clientSlug) {
      return json(res, 400, { error: "missing_client_slug" });
    }

    const scriptPath = join(ROOT, "landing-build", "build_landings.py");
    const args = [
      scriptPath,
      "--client-slug", clientSlug,
      "preview",
      "--base-url", blogBaseUrl || "",
    ];
    if (landingId) args.push("--landing-id", landingId);

    const py =
      process.platform === "win32"
        ? { command: "python", argsPrefix: [] }
        : getPythonCommand();

    execFile(py.command, [...py.argsPrefix, ...args], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 8,
      timeout: 30000,
      env: {
        ...process.env,
        LANDING_CLIENT_CONFIG_JSON: JSON.stringify(clientConfig || {}),
      },
    }, (err, stdout, stderr) => {
      console.log("[agent-relay] landings/preview result", {
        python: py.command,
        args: [...py.argsPrefix, ...args],
        hasKeyword: stdout.includes("medias de compresion para running"),
        hasPreviewTitle: stdout.includes("Preview de landing"),
        stderr: stderr.slice(0, 500),
      });
      if (err) {
        console.error("[agent-relay] landings/preview fallo:", err.message);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`No se pudo generar la preview localmente en el relay.\n${err.message}\n${stderr}`);
        return;
      }

      const htmlStart = stdout.indexOf("<!DOCTYPE html>");
      const html = htmlStart >= 0 ? stdout.slice(htmlStart) : stdout;

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
    });
    return;
  }

  // POST /landings/generate — inicia la generación local sin bloquear la UI remota.
  if (method === "POST" && url === "/landings/generate") {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: "invalid_json" }); }

    const clientSlug = String(body.clientSlug || "").trim();
    if (!clientSlug) return json(res, 400, { error: "missing_client_slug" });
    if (landingGenerationClients.has(clientSlug)) {
      return json(res, 409, { error: "generation_already_running" });
    }

    landingGenerationClients.add(clientSlug);
    const swarmPath = join(ROOT, "landing-build", "swarm.py");
    const python = getPythonCommand();
    console.log(`[agent-relay] landings/generate iniciado para ${clientSlug}`);
    json(res, 202, { accepted: true, clientSlug });

    const child = spawn(python.command, [...python.argsPrefix, swarmPath, "generate", "--limit", "10", "--client-slug", clientSlug], {
      cwd: ROOT,
      env: process.env,
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => console.log(`[agent-relay] landings/generate ${clientSlug}: ${chunk.toString().trim()}`));
    child.stderr.on("data", (chunk) => console.error(`[agent-relay] landings/generate ${clientSlug}: ${chunk.toString().trim()}`));
    child.on("close", (code) => {
      landingGenerationClients.delete(clientSlug);
      console.log(`[agent-relay] landings/generate finalizado para ${clientSlug} (exit ${code})`);
    });
    child.on("error", (error) => {
      landingGenerationClients.delete(clientSlug);
      console.error(`[agent-relay] landings/generate no pudo iniciar para ${clientSlug}:`, error.message);
    });
    return;
  }

  // POST /search/run — ejecuta social-listen.py por cada canal e importa oportunidades
  if (method === "POST" && url === "/search/run") {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: "invalid_json" }); }

    const { clientId, channels, query, language, limit } = body;
    if (!clientId || !Array.isArray(channels) || channels.length === 0 || typeof query !== "string" || !query.trim()) {
      return json(res, 400, { error: "missing_fields" });
    }

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    });

    const send = (event) => {
      res.write(`${JSON.stringify(event)}\n`);
    };

    const totals = {
      itemsRead: 0,
      intakeRows: 0,
      createdOrProcessed: 0,
      duplicates: 0,
      discarded: 0,
      completedChannels: 0,
      timedOutChannels: 0,
      errors: 0,
    };

    try {
      send({
        status: "started",
        message: "Busqueda iniciada.",
        data: { channels, language, limit, query, suggestions: [] },
      });

      for (const channel of channels) {
        send({ status: "channel_started", channel, message: `Buscando en ${channel}...` });
        const listen = await runProcess(commandName("python"), [
          join(ROOT, "agents", "social-listen.py"),
          "--channel", channel,
          "--query", query,
          "--limit", String(limit),
          "--client-id", clientId,
          "--language", language || "es",
        ], (line, streamName) => {
          if (streamName === "stderr" && line.includes("ERROR")) {
            send({ status: "error", channel, message: line.slice(0, 500) });
          }
        }, SEARCH_CHANNEL_TIMEOUT_MS);

        if (listen.timedOut) {
          totals.timedOutChannels += 1;
          send({
            status: "channel_timeout",
            channel,
            message: `${channel} tardo demasiado. Pasando a la siguiente red.`,
            data: { timeoutMs: SEARCH_CHANNEL_TIMEOUT_MS },
          });
          continue;
        }

        const listenSummary = extractLastJson(listen.stdout);
        if (listen.code !== 0 || !listenSummary) {
          totals.errors += 1;
          send({
            status: "error",
            channel,
            message: listen.stderr.trim() || "No se pudo leer el resumen de escucha.",
            data: { code: listen.code },
          });
          continue;
        }

        totals.itemsRead += Number(listenSummary.items_read || 0);
        totals.intakeRows += Number(listenSummary.intake_rows || 0);
        totals.discarded += Number(listenSummary.discarded_count || 0);
        send({
          status: "listen_done",
          channel,
          message: `${listenSummary.items_read || 0} items leidos, ${listenSummary.intake_rows || 0} candidatos.`,
          data: listenSummary,
        });

        send({ status: "import_started", channel, message: "Importando oportunidades nuevas..." });
        const imported = await runProcess(commandName("npx"), ["tsx", join(ROOT, "scripts", "import-opportunities.mts")], () => {});
        const importSummary = parseImportSummary(imported.stdout);
        if (imported.code !== 0) {
          totals.errors += 1;
          send({
            status: "error",
            channel,
            message: imported.stderr.trim() || importSummary.raw || "Fallo la importacion.",
            data: { code: imported.code },
          });
          continue;
        }

        totals.createdOrProcessed += importSummary.createdOrProcessed;
        totals.duplicates += importSummary.duplicates;
        totals.completedChannels += 1;
        send({
          status: "import_done",
          channel,
          message: `${importSummary.createdOrProcessed} procesadas, ${importSummary.duplicates} duplicadas.`,
          data: importSummary,
        });
      }

      send({
        status: "done",
        message: totals.createdOrProcessed > 0 ? "Busqueda finalizada." : "No se encontraron oportunidades nuevas.",
        data: totals,
      });
    } catch (error) {
      totals.errors += 1;
      send({
        status: "error",
        message: error instanceof Error ? error.message : "Error inesperado durante la busqueda.",
      });
      send({
        status: "done",
        message: "Busqueda interrumpida por un error interno.",
        data: totals,
      });
    } finally {
      res.end();
    }
    return;
  }

  json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[agent-relay] escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[agent-relay] token: ${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)}`);
  console.log(`[agent-relay] para exponer: cloudflared tunnel --url http://127.0.0.1:${PORT}`);
});

setInterval(runScheduledLandings, 60_000).unref();
void runScheduledLandings();

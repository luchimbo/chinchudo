// Relay local: búsqueda de oportunidades, logins de perfiles y túnel al LLM local.
// Exponer con: cloudflared tunnel --url http://127.0.0.1:3099
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleSearchRun } from "./search-run.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Cargar .env manualmente (el relay corre fuera de Next.js)
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^\uFEFF/, "");
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

const PORT = parseInt(process.env.AGENT_RELAY_PORT ?? "3099", 10);
const TOKEN = process.env.AGENT_RELAY_TOKEN;
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

async function proxyLocalLlm(req, res) {
  let body;
  try { body = await readBody(req); }
  catch { return json(res, 400, { error: "invalid_json" }); }

  const origin = (process.env.LLM_LOCAL_BASE_URL || process.env.LLM_BASE_URL || "http://127.0.0.1:11435/v1").replace(/\/+$/, "");
  const upstreamKey = process.env.LLM_LOCAL_UPSTREAM_API_KEY || process.env.LLM_API_KEY || "ollama";
  try {
    const upstream = await fetch(`${origin}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PCMidi-Project": "pcmidi-suite-relay",
        Authorization: `Bearer ${upstreamKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
      ...(upstream.headers.has("retry-after") ? { "Retry-After": upstream.headers.get("retry-after") } : {}),
    });
    res.end(payload);
  } catch (error) {
    console.error("[agent-relay] LLM upstream failed:", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "local_llm_unavailable" });
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
  // The blog runs on the SSH server (scripts/blog-runtime-service.mjs), not here.
  if (method === "GET" && url === "/health") {
    return json(res, 200, { ok: true, ts: Date.now() });
  }

  if (!authOk(req)) {
    return json(res, 401, { error: "unauthorized" });
  }

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

  // GET /accounts?channel=<canal>&client=<clientSlug>
  // Las cuentas son compartidas entre clientes; el cliente se conserva para
  // compatibilidad con llamadas anteriores, pero no restringe el resultado.
  if (method === "GET" && url.startsWith("/accounts")) {
    const parsedUrl = new URL(url, "http://localhost");
    const channel = parsedUrl.searchParams.get("channel") ?? "";
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

  // POST /search/run — social-listen.py por canal + importación (scripts/search-run.mjs, igual que en el servidor pcmidi)
  if (method === "POST" && url === "/search/run") {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: "invalid_json" }); }
    return handleSearchRun(body, res, json);
  }

  json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[agent-relay] escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[agent-relay] token: ${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)}`);
  console.log(`[agent-relay] para exponer: cloudflared tunnel --url http://127.0.0.1:${PORT}`);
});

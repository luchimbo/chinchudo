// Relay server: recibe pedidos de publicacion desde Vercel y los ejecuta localmente
// Exponer con: cloudflared tunnel --url http://127.0.0.1:3099
import http from "node:http";
import { execFile } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// Guarda el resultado de una publicacion en data/publish-results.json
function saveResult(opportunityId, result) {
  try {
    const existing = existsSync(RESULTS_PATH)
      ? JSON.parse(readFileSync(RESULTS_PATH, "utf-8"))
      : {};
    existing[opportunityId] = { ...result, ts: Date.now() };
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

  // GET /accounts?channel=<canal>
  if (method === "GET" && url.startsWith("/accounts")) {
    const channel = new URL(url, "http://localhost").searchParams.get("channel") ?? "";
    try {
      const accountsPath = join(ROOT, "agents", "accounts.json");
      const raw = JSON.parse(readFileSync(accountsPath, "utf-8"));
      let entries = Object.entries(raw).map(([name, cfg]) => ({
        name,
        label: cfg.label ?? name,
        defaultPersona: cfg.defaultPersona ?? "",
        allowedChannels: cfg.allowedChannels ?? [],
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

  // POST /publish — responde 202 inmediato, procesa en background
  if (method === "POST" && url === "/publish") {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: "invalid_json" }); }

    const { opportunityId, responseId, account } = body;
    if (!opportunityId || !responseId) {
      return json(res, 400, { error: "missing_fields" });
    }

    const args = [
      join(ROOT, "scripts", "publish-response.mjs"),
      "--opportunity-id", opportunityId,
      "--response-id", responseId,
    ];
    if (account) args.push("--account", account);

    console.log(`[agent-relay] encolando opp=${opportunityId} resp=${responseId} account=${account ?? "auto"}`);

    // Responder 202 de inmediato
    json(res, 202, { accepted: true, opportunityId, account: account ?? "auto" });

    // Procesar en background
    execFile("node", args, { cwd: ROOT, encoding: "utf-8", timeout: 180_000 },
      (err, stdout, stderr) => {
        const allOutput = (stdout ?? "") + "\n" + (stderr ?? "");
        const lastLine = (stdout ?? "").trim().split("\n").pop() ?? "{}";
        try {
          const result = JSON.parse(lastLine);
          if (result.success) {
            console.log(`[agent-relay] OK opp=${opportunityId}`, JSON.stringify(result));
            saveResult(opportunityId, { success: true, ...result });
          } else {
            console.warn(`[agent-relay] ERROR opp=${opportunityId} — ${result.error}`);
            saveResult(opportunityId, { success: false, error: result.error, detail: allOutput.slice(-500) });
          }
        } catch {
          const detail = err?.message || stderr || "spawn_failed";
          console.error(`[agent-relay] FALLO opp=${opportunityId} — ${detail}`);
          console.error("STDOUT:", stdout?.slice(-500));
          console.error("STDERR:", stderr?.slice(-500));
          saveResult(opportunityId, { success: false, error: "spawn_failed", detail: allOutput.slice(-500) });
        }
      }
    );
    return; // ya respondimos 202
  }

  json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[agent-relay] escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[agent-relay] token: ${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)}`);
  console.log(`[agent-relay] para exponer: cloudflared tunnel --url http://127.0.0.1:${PORT}`);
});

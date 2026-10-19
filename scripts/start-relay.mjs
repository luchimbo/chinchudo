/**
 * Arranca el relay + cloudflared tunnel en un solo comando.
 * Detecta la URL pública del tunnel y la actualiza automáticamente en la DB.
 * Uso: npm run relay:start
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Cargar .env
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

const PORT = process.env.AGENT_RELAY_PORT ?? "3099";

async function updateRelayUrl(url) {
  const prisma = new PrismaClient();
  try {
    await prisma.appSetting.upsert({
      where: { key: "AGENT_RELAY_URL" },
      update: { value: url },
      create: { key: "AGENT_RELAY_URL", value: url },
    });
    console.log(`\n✓ URL actualizada en DB: ${url}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

let tunnel = null;
let shuttingDown = false;
let retryTimer = null;
let retryDelayMs = 5_000;
let tunnelUrl = null;
let tunnelStartedAt = 0;
let healthFailures = 0;
let watchdog = null;

// Watchdog: un quick tunnel puede morir del lado de Cloudflare (el dominio
// deja de resolver) sin que cloudflared termine. Chequeamos /health a través
// de la URL pública y, si falla varias veces seguidas con el relay local
// sano, matamos cloudflared para que el handler de exit cree un túnel nuevo.
const WATCHDOG_INTERVAL_MS = 60_000;
const WATCHDOG_MAX_FAILURES = 3;
const TUNNEL_URL_TIMEOUT_MS = 120_000;

// 1) Arrancar el relay en background
console.log(`[start-relay] Arrancando relay en puerto ${PORT}...`);
const relay = spawn("node", [join(ROOT, "scripts", "agent-relay.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});

relay.on("error", (err) => {
  console.error("[start-relay] Error arrancando relay:", err.message);
  process.exit(1);
});

// Sin relay el túnel apunta a la nada (o a otro relay viejo que ocupa el
// puerto). Salimos para que start-relay.bat vuelva a levantar ambos.
relay.on("exit", (code, signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[start-relay] El relay terminó (code=${code ?? "n/a"}, signal=${signal ?? "n/a"}). Cerrando el túnel para reiniciar todo.`);
  if (retryTimer) clearTimeout(retryTimer);
  clearInterval(watchdog);
  tunnel?.kill();
  process.exit(1);
});

// Esperar que el relay levante
await new Promise((r) => setTimeout(r, 1500));

// 2) Arrancar cloudflared tunnel y detectar URL automáticamente.
// Si cloudflared termina (por ejemplo, por un fallo DNS), se relanza
// automáticamente sin tener que reiniciar el relay.

function startTunnel() {
  if (shuttingDown || tunnel) return;

  console.log(`[start-relay] Arrancando cloudflared tunnel...`);
  const child = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://127.0.0.1:${PORT}`],
    { cwd: ROOT, env: process.env }
  );
  tunnel = child;
  tunnelUrl = null;
  tunnelStartedAt = Date.now();
  healthFailures = 0;

  child.stdout.on("data", (data) => process.stdout.write(data));

  child.stderr.on("data", async (data) => {
    const text = data.toString();
    process.stderr.write(text);
    // api.trycloudflare.com aparece en los logs de registro/errores de
    // cloudflared y NO es la URL pública del túnel.
    const match = text.match(/https:\/\/(?!api\.)[a-z0-9\-]+\.trycloudflare\.com/);
    if (match) {
      retryDelayMs = 5_000;
      tunnelUrl = match[0];
      healthFailures = 0;
      try {
        await updateRelayUrl(match[0]);
      } catch (err) {
        console.error("[start-relay] No se pudo actualizar la URL en DB:", err.message);
      }
    }
  });

  child.on("error", (err) => {
    console.error("[start-relay] Error arrancando tunnel:", err.message);
  });

  child.on("exit", (code, signal) => {
    tunnel = null;
    if (shuttingDown) return;

    console.error(
      `[start-relay] cloudflared terminó (code=${code ?? "n/a"}, signal=${signal ?? "n/a"}). ` +
        `Reintentando en ${retryDelayMs / 1000}s...`
    );
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startTunnel();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
  });
}

startTunnel();

async function isHealthy(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkTunnel() {
  if (shuttingDown || !tunnel) return;

  if (!tunnelUrl) {
    if (Date.now() - tunnelStartedAt > TUNNEL_URL_TIMEOUT_MS) {
      console.error("[start-relay] cloudflared no publicó una URL a tiempo. Recreando el túnel...");
      tunnel.kill();
    }
    return;
  }

  // Si el relay local no responde, el problema no es el túnel.
  if (!(await isHealthy(`http://127.0.0.1:${PORT}`))) return;

  if (await isHealthy(tunnelUrl)) {
    if (healthFailures > 0) console.log(`[start-relay] El túnel volvió a responder (${tunnelUrl}).`);
    healthFailures = 0;
    return;
  }

  healthFailures += 1;
  console.error(`[start-relay] /health falló a través del túnel (${healthFailures}/${WATCHDOG_MAX_FAILURES}): ${tunnelUrl}`);
  if (healthFailures >= WATCHDOG_MAX_FAILURES && tunnel) {
    console.error("[start-relay] Túnel caído. Recreándolo...");
    retryDelayMs = 5_000;
    tunnel.kill();
  }
}

let watchdogRunning = false;
watchdog = setInterval(async () => {
  if (watchdogRunning) return;
  watchdogRunning = true;
  try { await checkTunnel(); }
  finally { watchdogRunning = false; }
}, WATCHDOG_INTERVAL_MS);

// Apagar todo junto al salir
process.on("SIGINT", () => {
  console.log("\n[start-relay] Cerrando relay y tunnel...");
  shuttingDown = true;
  if (retryTimer) clearTimeout(retryTimer);
  clearInterval(watchdog);
  relay.kill();
  tunnel?.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shuttingDown = true;
  if (retryTimer) clearTimeout(retryTimer);
  clearInterval(watchdog);
  relay.kill();
  tunnel?.kill();
  process.exit(0);
});

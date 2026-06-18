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

// Esperar que el relay levante
await new Promise((r) => setTimeout(r, 1500));

// 2) Arrancar cloudflared tunnel y detectar URL automáticamente
console.log(`[start-relay] Arrancando cloudflared tunnel...`);
const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--url", `http://127.0.0.1:${PORT}`],
  { cwd: ROOT, env: process.env }
);

tunnel.stdout.on("data", (data) => process.stdout.write(data));

tunnel.stderr.on("data", async (data) => {
  const text = data.toString();
  process.stderr.write(text);
  const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
  if (match) {
    await updateRelayUrl(match[0]);
  }
});

tunnel.on("error", (err) => {
  console.error("[start-relay] Error arrancando tunnel:", err.message);
});

// Apagar todo junto al salir
process.on("SIGINT", () => {
  console.log("\n[start-relay] Cerrando relay y tunnel...");
  relay.kill();
  tunnel.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  relay.kill();
  tunnel.kill();
  process.exit(0);
});

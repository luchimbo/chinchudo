// Estado del trabajador del blog, que corre en el servidor SSH "pcmidi".
// Uso: npm run blog:status
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
const host = process.env.BLOG_SERVER_HOST || "pcmidi";
const remoteDir = process.env.BLOG_SERVER_DIR || "services/pcmidi-suite";
const prisma = new PrismaClient();

try {
  const setting = await prisma.appSetting.findUnique({ where: { key: "blog_runtime_relay_url" } });
  const url = setting?.value?.replace(/\/$/, "");
  if (!url) console.log("Túnel del blog: no publicado (blog_runtime_relay_url vacío).");
  else {
    try {
      const response = await fetch(`${url}/blog/health`, { signal: AbortSignal.timeout(8000) });
      const body = await response.json();
      const code = body.blogCode;
      const state = !code ? "sin control de versión" : code.stale ? `DESACTUALIZADO (cargó ${code.loaded}, en disco ${code.disk})` : `al día (${code.loaded})`;
      console.log(`Trabajador del blog (${url}): activo · ${state}`);
    } catch (error) {
      console.log(`Trabajador del blog (${url}): sin respuesta (${error instanceof Error ? error.message : error})`);
    }
  }
} finally {
  await prisma.$disconnect();
}

const local = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
try {
  const remote = execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host,
    `cd ~/${remoteDir} && git rev-parse --short HEAD && git status --short --untracked-files=no | wc -l`], { encoding: "utf8", timeout: 30_000 }).trim().split("\n");
  console.log(`Servidor ${host}: commit ${remote[0]}${Number(remote[1]) ? ` con ${remote[1]} archivo(s) modificados a mano` : ""} · esta PC: ${local}`);
  if (remote[0] !== local) console.log("Para actualizarlo: bash scripts/server/deploy-blog-runtime.sh --apply");
} catch {
  console.log(`Servidor ${host}: no se pudo consultar por SSH.`);
}

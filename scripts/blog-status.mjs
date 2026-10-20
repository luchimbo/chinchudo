// Estado del blog en esta PC: procesos locales, código cargado y copia de despliegue de la app.
// Uso: npm run blog:status
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { blogCodeStatus } from "./blog-code-version.mjs";

const root = resolve(import.meta.dirname, "..");
const deployRoot = process.env.BLOG_DEPLOY_WORKTREE || "C:/Users/PC Midi/.codex/worktrees/kressmer-blog/pcmidi-suite";
// Git normaliza los fines de línea: CRLF y LF del mismo archivo no cuentan como diferencia.
const sha = (path) => createHash("sha1").update(readFileSync(path, "utf8").replaceAll("\r", "")).digest("hex");

async function health(name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const body = await response.json();
    const code = body.blogCode;
    const state = !code ? "sin control de versión (reiniciar)" : code.stale ? `DESACTUALIZADO (cargó ${code.loaded}, en disco ${code.disk})` : `al día (${code.loaded})`;
    console.log(`${name}: activo · ${state}`);
    return code?.loaded;
  } catch { console.log(`${name}: sin respuesta`); return undefined; }
}

const relay = await health("Relay (3099)", "http://127.0.0.1:3099/health");
const runtime = await health("Servicio del blog (3102)", "http://127.0.0.1:3102/blog/health");
console.log(`Código en disco: ${blogCodeStatus().disk}`);
if (relay && runtime && relay !== runtime) console.log("ATENCIÓN: el relay y el servicio del blog corren versiones distintas.");

if (!existsSync(deployRoot)) console.log(`Copia de despliegue no encontrada: ${deployRoot}`);
else {
  const files = execFileSync("git", ["ls-files", "src", "scripts", "prisma"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => /blog/i.test(file));
  const different = files.filter((file) => !existsSync(resolve(deployRoot, file)) || sha(resolve(root, file)) !== sha(resolve(deployRoot, file)));
  console.log(different.length ? `Copia de despliegue desactualizada (${different.length} archivos del blog):\n${different.map((file) => `  - ${file}`).join("\n")}` : "Copia de despliegue al día con el código del blog.");
}

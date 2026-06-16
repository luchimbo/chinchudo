/**
 * backup-db.mjs
 * Copia dev.db a backups/dev-YYYYMMDD-HHMMSS.db
 * Uso: node scripts/backup-db.mjs
 * También exporta un CSV con npm run agents:export antes de copiar.
 */

import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";

const ROOT       = resolve(import.meta.dirname, "..");
const DB_PATH    = join(ROOT, "prisma", "dev.db");
const BACKUP_DIR = join(ROOT, "backups");
const MAX_KEEP   = 14; // retener últimos 14 backups

function stamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
}

// 1. Exportar CSV primero
console.log("backup: exportando CSV…");
try {
  execSync("node scripts/export-csv.mjs", { cwd: ROOT, stdio: "inherit" });
} catch {
  console.warn("backup: export CSV falló, continuando igual.");
}

// 2. Copiar dev.db si existe (puede no existir si ya se migró a Supabase)
if (!existsSync(DB_PATH)) {
  console.log("backup: dev.db no encontrado (Supabase activo). Solo se exportó el CSV.");
  process.exit(0);
}

mkdirSync(BACKUP_DIR, { recursive: true });
const dest = join(BACKUP_DIR, `dev-${stamp()}.db`);
copyFileSync(DB_PATH, dest);
console.log(`backup: copia guardada en ${dest}`);

// 3. Rotar backups (conservar solo los últimos MAX_KEEP)
const files = readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith("dev-") && f.endsWith(".db"))
  .sort();

if (files.length > MAX_KEEP) {
  const toDelete = files.slice(0, files.length - MAX_KEEP);
  for (const f of toDelete) {
    unlinkSync(join(BACKUP_DIR, f));
    console.log(`backup: eliminado backup viejo ${f}`);
  }
}

console.log(`backup: OK. Total backups: ${Math.min(files.length, MAX_KEEP)}`);

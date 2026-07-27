/**
 * backup-db.mjs
 * Respalda la base real (Supabase Postgres, via Prisma) a backups/supabase-YYYYMMDD-HHMMSS.json
 * y exporta el CSV operativo antes de volcar.
 * Uso: node scripts/backup-db.mjs
 */

import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { PrismaClient } from "@prisma/client";

const ROOT       = resolve(import.meta.dirname, "..");
const LEGACY_DB  = join(ROOT, "prisma", "dev.db");
const BACKUP_DIR = join(ROOT, "backups");
const MAX_KEEP   = 14; // retener últimos 14 backups de cada tipo

const TABLES = [
  "client", "user", "brand", "product", "persona", "personaRule", "channel",
  "catalogRule", "knowledgeBase", "objection", "monitoredSource", "promptVersion",
  "opportunity", "response", "publishingLog", "observedProfile", "observedInterest",
  "observedEvent", "appSetting",
];

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

function rotate(prefix, ext) {
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith(ext))
    .sort();
  if (files.length > MAX_KEEP) {
    for (const f of files.slice(0, files.length - MAX_KEEP)) {
      unlinkSync(join(BACKUP_DIR, f));
      console.log(`backup: eliminado backup viejo ${f}`);
    }
  }
}

// 1. Exportar CSV primero
console.log("backup: exportando CSV…");
try {
  execSync("node scripts/export-csv.mjs", { cwd: ROOT, stdio: "inherit" });
} catch {
  console.warn("backup: export CSV falló, continuando igual.");
}

mkdirSync(BACKUP_DIR, { recursive: true });

// 2. Volcado JSON de la base real (Supabase)
const prisma = new PrismaClient();
try {
  const dump = { createdAt: new Date().toISOString(), tables: {} };
  let total = 0;
  for (const table of TABLES) {
    const rows = await prisma[table].findMany();
    dump.tables[table] = rows;
    total += rows.length;
    console.log(`backup: ${table}: ${rows.length} filas`);
  }
  const dest = join(BACKUP_DIR, `supabase-${stamp()}.json`);
  writeFileSync(dest, JSON.stringify(dump), "utf8");
  console.log(`backup: volcado guardado en ${dest} (${total} filas totales)`);
  rotate("supabase-", ".json");
} finally {
  await prisma.$disconnect();
}

// 3. Copia legacy de dev.db solo si existe (etapa SQLite ya migrada)
if (existsSync(LEGACY_DB)) {
  const dest = join(BACKUP_DIR, `dev-${stamp()}.db`);
  copyFileSync(LEGACY_DB, dest);
  console.log(`backup: copia legacy dev.db guardada en ${dest}`);
  rotate("dev-", ".db");
}

console.log("backup: OK.");

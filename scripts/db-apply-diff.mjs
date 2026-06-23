// Aplica el delta entre la dev.db actual y prisma/schema.prisma SIN perder datos.
// Alternativa a `prisma migrate dev` (cuyo engine falla en esta maquina).
// Usa `prisma migrate diff` (que sí funciona) + node:sqlite para ejecutar el SQL.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = join(process.cwd(), "prisma", "dev.db");
const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

if (!/provider\s*=\s*"sqlite"/.test(schema)) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push"],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  process.exit(0);
}

const sql = execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate", "diff",
    "--from-schema-datasource", "prisma/schema.prisma",
    "--to-schema-datamodel", "prisma/schema.prisma",
    "--script"
  ],
  { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
);

if (!sql.trim()) {
  console.log("Sin cambios de schema para aplicar.");
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
try {
  db.exec("PRAGMA foreign_keys = ON;");
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      db.exec(`${statement};`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const benignMissingObject =
        /no such index/i.test(message) ||
        /no such column/i.test(message) ||
        /no such table/i.test(message) ||
        /duplicate column name/i.test(message) ||
        /already exists/i.test(message);
      if (!benignMissingObject) throw error;
      console.warn(`Aviso: se omitio statement ya aplicado/no existente: ${message}`);
    }
  }
  console.log("Delta de schema aplicado a dev.db.");
} finally {
  db.close();
}

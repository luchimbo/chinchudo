// Aplica el delta entre la dev.db actual y prisma/schema.prisma SIN perder datos.
// Alternativa a `prisma migrate dev` (cuyo engine falla en esta maquina).
// Usa `prisma migrate diff` (que sí funciona) + node:sqlite para ejecutar el SQL.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = join(process.cwd(), "prisma", "dev.db");

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
  db.exec(sql);
  console.log("Delta de schema aplicado a dev.db.");
} finally {
  db.close();
}

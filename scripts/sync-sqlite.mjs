import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = join(process.cwd(), "prisma", "dev.db");

if (existsSync(dbPath)) {
  console.log(`SQLite database already exists at ${dbPath}`);
  process.exit(0);
}

mkdirSync(dirname(dbPath), { recursive: true });

const sql = execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script"
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  }
);

const db = new DatabaseSync(dbPath);

try {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(sql);
  console.log(`SQLite database created at ${dbPath}`);
} finally {
  db.close();
}

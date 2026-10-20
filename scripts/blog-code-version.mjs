import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// Módulos que cada proceso carga en memoria al arrancar; editarlos exige reiniciarlo.
export const BLOG_CODE_FILES = [
  "scripts/blog-daily.mjs", "scripts/blog-preparation.mjs", "scripts/blog-lease.mjs",
  "src/lib/blog-quality.mjs", "src/lib/blog-free-slot.mjs", "src/lib/blog-intent.mjs", "src/lib/blog-evidence.mjs",
];

export function blogCodeHash(base = root) {
  const hash = createHash("sha1");
  for (const file of BLOG_CODE_FILES) {
    const path = resolve(base, file);
    hash.update(file).update(existsSync(path) ? readFileSync(path) : "missing");
  }
  return hash.digest("hex").slice(0, 10);
}

const loaded = blogCodeHash();

/** `stale` indica que el archivo en disco cambió después de que arrancó este proceso. */
export function blogCodeStatus() {
  const disk = blogCodeHash();
  return { loaded, disk, stale: loaded !== disk };
}

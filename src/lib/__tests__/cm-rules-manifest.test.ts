import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../cm-rules-version.json";

// Every host reads this committed manifest to decide whether a proposal is
// fresh. If it is stale, Vercel and the CM workers disagree after a deploy.
describe("manifiesto de reglas del Asistente CM", () => {
  it("coincide con los archivos de generación actuales (correr npm run dev o node scripts/cm-rules-version.mjs)", () => {
    const hash = createHash("sha256");
    for (const file of manifest.files) hash.update(file).update(readFileSync(join(process.cwd(), "src/lib", file), "utf8").replace(/\r\n/g, "\n"));
    expect(hash.digest("hex")).toBe(manifest.version);
  });
});

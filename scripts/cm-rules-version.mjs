import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const files = [
  "ai-draft-generator.ts", "draft-generator.ts", "draft-output.ts", "cm-editorial.ts",
  "copilot-limits.ts", "response-policy.ts", "catalog.ts", "knowledge.ts", "client-context.ts",
  "persona-router.ts", "product-public-name.ts", "brand-identity.ts", "guardrails.ts",
  "jurispedia-policy.ts", "vidia-policy.ts", "llm-provider.ts", "client-memory.ts",
  "observed-profiles.ts", "competitor-evidence.ts", "product-identity.ts", "cm-maintenance.ts",
  "../app/(app)/opportunities/actions.ts", "cm-freshness.ts", "cm-version.ts", "prompts.ts", "../../scripts/draft-worker.mts",
];
const hash = createHash("sha256");
for (const file of files) hash.update(file).update(readFileSync(join(process.cwd(), "src/lib", file), "utf8").replace(/\r\n/g, "\n"));
writeFileSync("src/lib/cm-rules-version.json", JSON.stringify({ files, version: hash.digest("hex") }, null, 2) + "\n");
console.log("Reglas del Asistente CM versionadas.");

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import manifest from "./cm-rules-version.json";
import { cmHash } from "./cm-freshness";

export function cmRulesVersion(): string {
  try {
    const hash = createHash("sha256");
    for (const file of manifest.files) hash.update(file).update(readFileSync(join(process.cwd(), "src/lib", file), "utf8").replace(/\r\n/g, "\n"));
    return hash.digest("hex");
  } catch {
    // Deployed bundles use the manifest created before next build.
    return manifest.version;
  }
}

function contentRows<T extends object>(rows: T[]) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) =>
    !["createdAt", "updatedAt", "sourceSnapshotAt", "avatarUrl", "voiceId"].includes(key),
  )));
}

/** Client-scoped content only: credentials, listening counters and UI settings never enter the hash. */
export async function loadCMVersion(db: PrismaClient, clientId: string): Promise<string> {
  const [client, prompts, brands, products, services, personas, personaRules, rules, knowledge, objections, memories, examples, channels] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: clientId }, select: {
      id: true, slug: true, name: true, description: true, responsePolicy: true, domainKeywords: true,
      domainExclusions: true, storeUrl: true, openrouterModel: true,
    } }),
    db.promptVersion.findMany({ where: { name: "response-generator", active: true }, orderBy: { updatedAt: "desc" }, take: 1 }),
    db.brand.findMany({ where: { clientId }, orderBy: { id: "asc" } }),
    db.product.findMany({ where: { brand: { clientId } }, orderBy: { id: "asc" } }),
    db.service.findMany({ where: { brand: { clientId } }, orderBy: { id: "asc" } }),
    db.persona.findMany({ where: { clientId }, orderBy: { id: "asc" } }),
    db.personaRule.findMany({ where: { persona: { clientId } }, orderBy: { id: "asc" } }),
    db.catalogRule.findMany({ where: { clientId }, orderBy: { id: "asc" } }),
    db.knowledgeBase.findMany({ where: { OR: [{ clientId }, { clientId: null }] }, orderBy: { id: "asc" } }),
    db.objection.findMany({ where: { OR: [{ clientId }, { clientId: null }] }, orderBy: { id: "asc" } }),
    db.clientMemory.findMany({ where: { clientId, active: true }, orderBy: { id: "asc" }, select: { id: true, rule: true, category: true, responseId: true } }),
    db.response.findMany({ where: { opportunity: { clientId }, acceptedAsCorrectAt: { not: null } }, orderBy: { id: "asc" },
      select: { id: true, brandId: true, draftText: true, editedText: true, acceptedAsCorrectAt: true } }),
    db.channel.findMany({ where: { name: "YouTube" }, orderBy: { id: "asc" } }),
  ]);
  return cmHash({ rulesVersion: cmRulesVersion(), client, prompts: contentRows(prompts), brands: contentRows(brands),
    products: contentRows(products), services: contentRows(services), personas: contentRows(personas), personaRules: contentRows(personaRules), rules: contentRows(rules),
    knowledge: contentRows(knowledge), objections: contentRows(objections), memories, examples, channels,
    modelConfig: {
      provider: process.env.LLM_PROVIDER || "schedule",
      localModel: process.env.LLM_LOCAL_MODEL || process.env.LLM_MODEL || "qwen3.8:latest",
      openrouterModel: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-lite",
      localStart: process.env.LLM_LOCAL_START || "09:30", localEnd: process.env.LLM_LOCAL_END || "17:30",
      timeZone: process.env.LLM_SCHEDULE_TIMEZONE || "America/Argentina/Buenos_Aires",
    },
  });
}

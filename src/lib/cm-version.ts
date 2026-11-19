import type { PrismaClient } from "@prisma/client";
import manifest from "./cm-rules-version.json";
import { cmHash } from "./cm-freshness";

/**
 * Every host (Vercel, the CM workers on this PC) reads the same committed
 * manifest, so a proposal generated in one place is fresh in all of them.
 * `npm run build` / `npm run dev` refresh it from the generation rules.
 */
export function cmRulesVersion(): string {
  return manifest.version;
}

function contentRows<T extends object>(rows: T[]) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) =>
    !["createdAt", "updatedAt", "sourceSnapshotAt", "avatarUrl", "voiceId"].includes(key),
  )));
}

/**
 * Client-scoped content only: credentials, listening counters and UI settings
 * never enter the hash. Learned memories and accepted examples apply to the
 * next generation but do not turn every existing proposal stale.
 */
export async function loadCMVersion(db: PrismaClient, clientId: string): Promise<string> {
  const [client, prompts, brands, products, services, personas, personaRules, rules, knowledge, objections, channels] = await Promise.all([
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
    db.channel.findMany({ where: { name: "YouTube" }, orderBy: { id: "asc" } }),
  ]);
  return cmHash({ rulesVersion: cmRulesVersion(), client, prompts: contentRows(prompts), brands: contentRows(brands),
    products: contentRows(products), services: contentRows(services), personas: contentRows(personas), personaRules: contentRows(personaRules), rules: contentRows(rules),
    knowledge: contentRows(knowledge), objections: contentRows(objections), channels,
  });
}

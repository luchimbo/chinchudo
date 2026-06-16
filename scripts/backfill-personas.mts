/**
 * Genera borradores para las voces que le faltan a cada oportunidad ya procesada.
 * Solo crea los borradores faltantes — no toca las voces que ya tienen respuesta.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { suggestAllPersonas } from "../src/lib/persona-router.ts";
import { generateAIDrafts } from "../src/lib/ai-draft-generator.ts";
import { generateLocalDrafts } from "../src/lib/draft-generator.ts";
import { shouldUseAi } from "../src/lib/draft-policy.ts";
import { loadRelevantKnowledge } from "../src/lib/knowledge.ts";
import { loadActivePrompt } from "../src/lib/prompts.ts";

loadEnv();
const prisma = new PrismaClient();

function parseArgs() {
  const limitIndex = process.argv.indexOf("--limit");
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
    useAi: process.argv.includes("--use-ai") || process.env.npm_config_use_ai === "true",
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1] || 50) : Number(process.env.npm_config_limit || 50),
  };
}

async function main() {
  const args = parseArgs();
  const allowAi = shouldUseAi(args);

  const [fallbackBrand, personas] = await Promise.all([
    prisma.brand.findFirst({ orderBy: { name: "asc" } }),
    prisma.persona.findMany(),
  ]);
  if (!fallbackBrand || personas.length === 0) throw new Error("Faltan marcas o personas.");

  const personaByName = new Map(personas.map((p) => [p.name, p]));
  const allPersonaIds = new Set(personas.map((p) => p.id));

  // Oportunidades que tienen respuesta para al menos una voz pero no para todas
  const opportunities = await prisma.opportunity.findMany({
    where: { status: { in: ["DRAFTED", "NEW", "NEEDS_REVIEW"] } },
    include: {
      channel: true,
      detectedBrand: true,
      detectedProduct: true,
      responses: { select: { personaId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: args.limit,
  });

  // Filtrar: solo las que les falta al menos 1 voz
  const incomplete = opportunities.filter((opp) => {
    const covered = new Set(opp.responses.map((r) => r.personaId));
    return allPersonaIds.size > covered.size;
  });

  console.log(`Oportunidades incompletas: ${incomplete.length} de ${opportunities.length} revisadas`);

  let drafted = 0;
  let aiUsed = 0;
  let localUsed = 0;
  const errors: { opportunityId: string; error: string }[] = [];
  const routing: { opportunityId: string; persona: string; reason: string; source: string }[] = [];

  const activeSystemPrompt = await loadActivePrompt(prisma);

  for (const opportunity of incomplete) {
    const brand = opportunity.detectedBrand ?? fallbackBrand;
    const coveredPersonaIds = new Set(opportunity.responses.map((r) => r.personaId));

    const suggestions = suggestAllPersonas(opportunity);
    const missing = suggestions.filter((s) => {
      const p = personaByName.get(s.personaName);
      return p && !coveredPersonaIds.has(p.id);
    });

    if (missing.length === 0) continue;

    let knowledge: Awaited<ReturnType<typeof loadRelevantKnowledge>>["knowledge"];
    let objections: Awaited<ReturnType<typeof loadRelevantKnowledge>>["objections"];
    try {
      const r = await loadRelevantKnowledge(prisma, {
        sourceText: opportunity.sourceText,
        brandId: brand.id,
        productId: opportunity.detectedProductId,
      });
      knowledge = r.knowledge;
      objections = r.objections;
    } catch (e) {
      errors.push({ opportunityId: opportunity.id, error: `carga de contexto: ${(e as Error).message}` });
      continue;
    }

    const newRows: {
      opportunityId: string; brandId: string; personaId: string;
      variantType: string; draftText: string; riskNotes: string;
    }[] = [];

    for (const suggestion of missing) {
      const persona = personaByName.get(suggestion.personaName)!;
      try {
        const ctx = { opportunity, persona, brand, knowledge, objections, activeSystemPrompt };
        let source = "local";
        let variants = allowAi ? await generateAIDrafts(ctx) : null;
        if (variants && variants.length > 0) { source = "ai"; } else { variants = generateLocalDrafts(ctx); }
        if (source === "ai") aiUsed++; else localUsed++;

        routing.push({ opportunityId: opportunity.id, persona: persona.name, reason: suggestion.reason, source });

        for (const v of variants) {
          newRows.push({
            opportunityId: opportunity.id,
            brandId: brand.id,
            personaId: persona.id,
            variantType: v.variantType,
            draftText: v.draftText,
            riskNotes: v.riskNotes,
          });
        }
      } catch (e) {
        errors.push({ opportunityId: opportunity.id, error: `${persona.name}: ${(e as Error).message}` });
      }
    }

    if (newRows.length === 0) continue;

    if (args.dryRun) {
      drafted += newRows.length;
      console.log(`  [dry] ${opportunity.id.slice(-8)}: +${newRows.length} borradores (${missing.map(s=>s.personaName).join(", ")})`);
      continue;
    }

    try {
      await prisma.response.createMany({ data: newRows });
      drafted += newRows.length;
    } catch (e) {
      errors.push({ opportunityId: opportunity.id, error: `guardado: ${(e as Error).message}` });
    }
  }

  const report = writeReport("backfill-personas", {
    command: "backfill-personas",
    dry_run: args.dryRun,
    opportunities_checked: opportunities.length,
    opportunities_incomplete: incomplete.length,
    drafts_created: drafted,
    ai_used: aiUsed,
    local_used: localUsed,
    routing,
    errors,
  });

  await prisma.$disconnect();

  if (errors.length) console.error(`backfill: ${errors.length} errores. Reporte: ${report}`);
  console.log(`backfill: ${drafted} borradores nuevos (${aiUsed} IA / ${localUsed} local). Reporte: ${report}`);
}

main().catch(async (e) => {
  await prisma.$disconnect();
  console.error(e);
  process.exit(1);
});

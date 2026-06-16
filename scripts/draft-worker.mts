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
    // En dry-run no se llama a IA por defecto (evita gasto accidental). --use-ai lo fuerza.
    useAi: process.argv.includes("--use-ai") || process.env.npm_config_use_ai === "true",
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1] || 5) : Number(process.env.npm_config_limit || 5),
  };
}

async function main() {
  const args = parseArgs();

  const [fallbackBrand, personas] = await Promise.all([
    prisma.brand.findFirst({ orderBy: { name: "asc" } }),
    prisma.persona.findMany(),
  ]);

  if (!fallbackBrand || personas.length === 0) {
    throw new Error("Faltan marcas o personas. Ejecuta npm run db:seed antes de generar borradores.");
  }

  const personaByName = new Map(personas.map((p) => [p.name, p]));

  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: { in: ["NEW", "NEEDS_REVIEW"] },
      responses: { none: {} },
    },
    include: { channel: true, detectedBrand: true, detectedProduct: true },
    orderBy: { createdAt: "asc" },
    take: args.limit,
  });

  let drafted = 0;
  let aiUsed = 0;
  let localUsed = 0;
  const errors: { opportunityId: string; error: string }[] = [];
  const routing: { opportunityId: string; persona: string; reason: string; source: string }[] = [];

  // En dry-run no se llama a IA salvo --use-ai explícito (evita gasto accidental).
  const allowAi = shouldUseAi(args);

  for (const opportunity of opportunities) {
    const brand = opportunity.detectedBrand ?? fallbackBrand;

    // 1) Router sugiere las 5 voces, cada una con su ángulo propio
    const suggestions = suggestAllPersonas(opportunity);

    // Cargamos conocimiento y prompt una sola vez por oportunidad
    let knowledge: Awaited<ReturnType<typeof loadRelevantKnowledge>>["knowledge"];
    let objections: Awaited<ReturnType<typeof loadRelevantKnowledge>>["objections"];
    let activeSystemPrompt: Awaited<ReturnType<typeof loadActivePrompt>>;
    try {
      const [knowledgeResult, promptResult] = await Promise.all([
        loadRelevantKnowledge(prisma, {
          sourceText: opportunity.sourceText,
          brandId: brand.id,
          productId: opportunity.detectedProductId,
        }),
        loadActivePrompt(prisma),
      ]);
      knowledge = knowledgeResult.knowledge;
      objections = knowledgeResult.objections;
      activeSystemPrompt = promptResult;
    } catch (error) {
      errors.push({ opportunityId: opportunity.id, error: `carga de contexto: ${(error as Error).message}` });
      continue;
    }

    const allRows: {
      opportunityId: string; brandId: string; personaId: string;
      variantType: string; draftText: string; riskNotes: string;
    }[] = [];
    let opportunityHadError = false;

    // 2) Generar borradores para cada voz
    for (const suggestion of suggestions) {
      const persona = personaByName.get(suggestion.personaName);
      if (!persona) {
        errors.push({
          opportunityId: opportunity.id,
          error: `Persona "${suggestion.personaName}" no existe en la BD. Revisá persona-router.ts vs prisma/seed.ts.`,
        });
        opportunityHadError = true;
        continue;
      }

      try {
        const ctx = { opportunity, persona, brand, knowledge, objections, activeSystemPrompt };
        let source = "local";
        let variants = allowAi ? await generateAIDrafts(ctx) : null;
        if (variants && variants.length > 0) {
          source = "ai";
        } else {
          variants = generateLocalDrafts(ctx);
        }
        if (source === "ai") aiUsed++; else localUsed++;

        routing.push({ opportunityId: opportunity.id, persona: persona.name, reason: suggestion.reason, source });

        for (const v of variants) {
          allRows.push({
            opportunityId: opportunity.id,
            brandId: brand.id,
            personaId: persona.id,
            variantType: v.variantType,
            draftText: v.draftText,
            riskNotes: v.riskNotes,
          });
        }
      } catch (error) {
        errors.push({ opportunityId: opportunity.id, error: `persona ${persona.name}: ${(error as Error).message}` });
        opportunityHadError = true;
      }
    }

    if (allRows.length === 0) continue;

    if (args.dryRun) {
      drafted += allRows.length;
      continue;
    }

    try {
      await prisma.$transaction([
        prisma.response.createMany({ data: allRows }),
        prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { detectedBrandId: brand.id, status: opportunityHadError ? "NEEDS_REVIEW" : "DRAFTED" },
        }),
      ]);
      drafted += allRows.length;
    } catch (error) {
      errors.push({ opportunityId: opportunity.id, error: `guardado: ${(error as Error).message}` });
    }
  }

  const report = writeReport("draft-worker", {
    command: "draft",
    dry_run: args.dryRun,
    opportunities_read: opportunities.length,
    drafts_created: drafted,
    ai_used: aiUsed,
    local_used: localUsed,
    routing,
    errors,
  });

  await prisma.$disconnect();

  if (errors.length) {
    console.error(`draft-worker: ${errors.length} errores. Reporte: ${report}`);
    process.exit(1);
  }
  console.log(`draft-worker: ${drafted} borradores (${aiUsed} IA / ${localUsed} local). Reporte: ${report}`);
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});

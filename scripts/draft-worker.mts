import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { suggestAllPersonasForClient } from "../src/lib/persona-router.ts";
import { generateAIDrafts } from "../src/lib/ai-draft-generator.ts";
import { generateLocalDrafts } from "../src/lib/draft-generator.ts";
import { shouldUseAi } from "../src/lib/draft-policy.ts";
import { loadRelevantKnowledge } from "../src/lib/knowledge.ts";
import { loadActivePrompt } from "../src/lib/prompts.ts";
import { loadClientContext, resolveOpportunityClient } from "../src/lib/client-context.ts";
import { detectCrossClientTerms, validateClientScopedActors } from "../src/lib/guardrails.ts";

loadEnv();

const prisma = new PrismaClient();

function parseArgs() {
  const limitIndex = process.argv.indexOf("--limit");
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
    useAi: process.argv.includes("--use-ai") || process.env.npm_config_use_ai === "true",
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1] || 5) : Number(process.env.npm_config_limit || 5),
  };
}

async function main() {
  const args = parseArgs();

  let agentAccounts: { name: string; defaultPersona: string }[] = [];
  try {
    const accountsPath = join(process.cwd(), "agents/accounts.json");
    const raw = JSON.parse(readFileSync(accountsPath, "utf-8"));
    agentAccounts = Object.entries(raw).map(([name, cfg]: [string, any]) => ({
      name,
      defaultPersona: cfg.defaultPersona ?? "",
    }));
  } catch {
    // accounts.json no disponible
  }

  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: { in: ["NEW", "NEEDS_REVIEW"] },
      responses: { none: {} },
    },
    include: {
      channel: true,
      detectedBrand: { include: { client: true } },
      detectedProduct: true,
      monitoredSource: { include: { client: true } },
    },
    orderBy: { createdAt: "asc" },
    take: args.limit,
  });

  let drafted = 0;
  let aiUsed = 0;
  let localUsed = 0;
  const errors: { opportunityId: string; error: string }[] = [];
  const routing: {
    opportunityId: string;
    clientId: string;
    clientSlug: string;
    confidence: string;
    clientReason: string;
    persona: string;
    reason: string;
    source: string;
  }[] = [];

  const allowAi = shouldUseAi(args);

  for (const opportunity of opportunities) {
    let resolution: Awaited<ReturnType<typeof resolveOpportunityClient>>;
    let clientContext: Awaited<ReturnType<typeof loadClientContext>>;
    try {
      resolution = await resolveOpportunityClient(prisma, opportunity);
      clientContext = await loadClientContext(prisma, resolution.client.id, opportunity);
    } catch (error) {
      errors.push({ opportunityId: opportunity.id, error: `cliente/contexto: ${(error as Error).message}` });
      continue;
    }

    const brand = clientContext.brand;
    const personaByName = new Map(clientContext.personas.map((p) => [p.name, p]));
    const suggestions = await suggestAllPersonasForClient(prisma, opportunity, resolution.client.id);

    let knowledge: Awaited<ReturnType<typeof loadRelevantKnowledge>>["knowledge"];
    let objections: Awaited<ReturnType<typeof loadRelevantKnowledge>>["objections"];
    let activeSystemPrompt: Awaited<ReturnType<typeof loadActivePrompt>>;
    try {
      const [knowledgeResult, promptResult] = await Promise.all([
        loadRelevantKnowledge(prisma, {
          sourceText: opportunity.sourceText,
          clientId: resolution.client.id,
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
      id: string;
      opportunityId: string;
      brandId: string;
      personaId: string;
      variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
      draftText: string;
      riskNotes: string;
      approvedBy?: string;
    }[] = [];
    let opportunityHadError = false;

    for (const suggestion of suggestions) {
      const persona = personaByName.get(suggestion.personaName);
      if (!persona) {
        errors.push({
          opportunityId: opportunity.id,
          error: `Persona "${suggestion.personaName}" no existe para cliente ${resolution.client.slug}.`,
        });
        opportunityHadError = true;
        continue;
      }

      const actorValidation = validateClientScopedActors({ client: resolution.client, brand, persona });
      if (!actorValidation.ok) {
        errors.push({ opportunityId: opportunity.id, error: `guardrail actores: ${actorValidation.riskNotes.join("; ")}` });
        opportunityHadError = true;
        continue;
      }

      try {
        const ctx = {
          opportunity,
          persona,
          brand,
          client: resolution.client,
          catalogProducts: clientContext.catalogProducts,
          catalogRules: clientContext.catalogRules,
          knowledge,
          objections,
          activeSystemPrompt,
        };
        let source = "local";
        let variants = allowAi ? await generateAIDrafts(ctx) : null;
        if (variants && variants.length > 0) source = "ai";
        else variants = generateLocalDrafts(ctx);
        if (source === "ai") aiUsed++;
        else localUsed++;

        routing.push({
          opportunityId: opportunity.id,
          clientId: resolution.client.id,
          clientSlug: resolution.client.slug,
          confidence: resolution.confidence,
          clientReason: resolution.reason,
          persona: persona.name,
          reason: suggestion.reason,
          source,
        });

        for (const v of variants) {
          const crossClientHits = await detectCrossClientTerms(prisma, resolution.client.id, v.draftText);
          const riskNotes = [
            v.riskNotes,
            resolution.confidence !== "high" ? `Cliente resuelto con confianza ${resolution.confidence}: ${resolution.reason}.` : "",
            ...actorValidation.riskNotes,
            crossClientHits.length > 0 ? `Posible mezcla de otro cliente: ${crossClientHits.join("; ")}.` : "",
          ].filter(Boolean).join(" ");

          allRows.push({
            id: randomUUID(),
            opportunityId: opportunity.id,
            brandId: brand.id,
            personaId: persona.id,
            variantType: v.variantType as any,
            draftText: v.draftText,
            riskNotes,
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

    let approvedResponseId: string | null = null;
    let approvedAccount: string | null = null;
    const autoApprove = resolution.client.autoApprove && !opportunityHadError && resolution.confidence === "high";
    const autoPublish = resolution.client.autoPublish && !opportunityHadError && resolution.confidence === "high";

    if (autoApprove || autoPublish) {
      const bestPersonaName = suggestions[0]?.personaName;
      const bestPersona = bestPersonaName ? personaByName.get(bestPersonaName) : null;
      if (bestPersona) {
        const bestRow = allRows.find(
          (row) => row.personaId === bestPersona.id && row.variantType === "CONVERSATIONAL"
        );
        if (bestRow) {
          bestRow.approvedBy = "Auto-Pilot";
          approvedResponseId = bestRow.id;

          const suggestedAccount = agentAccounts.find((a) => a.defaultPersona === bestPersonaName);
          approvedAccount = suggestedAccount ? suggestedAccount.name : null;
        }
      }
    }

    try {
      const opportunityStatus = autoPublish || autoApprove
        ? "APPROVED"
        : (opportunityHadError || resolution.confidence === "low" ? "NEEDS_REVIEW" : "DRAFTED");

      await prisma.$transaction([
        prisma.response.createMany({ data: allRows }),
        prisma.opportunity.update({
          where: { id: opportunity.id },
          data: {
            detectedBrandId: brand.id,
            status: opportunityStatus,
          },
        }),
      ]);
      drafted += allRows.length;

      if (autoPublish && approvedResponseId) {
        console.log(`[Auto-Pilot] Publicando automáticamente oportunidad ${opportunity.id} con respuesta ${approvedResponseId}...`);
        const pArgs = [
          "scripts/publish-response.mjs",
          "--opportunity-id", opportunity.id,
          "--response-id", approvedResponseId
        ];
        if (approvedAccount) pArgs.push("--account", approvedAccount);

        try {
          const raw = execFileSync("node", pArgs, { cwd: process.cwd(), encoding: "utf-8" });
          console.log(`[Auto-Pilot] Resultado de publicación: ${raw.trim()}`);
        } catch (publishError) {
          console.error(`[Auto-Pilot] Error al auto-publicar:`, publishError);
        }
      }
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

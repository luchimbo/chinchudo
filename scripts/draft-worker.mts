import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { suggestAllPersonasForClient } from "../src/lib/persona-router";
import { generateAIDrafts } from "../src/lib/ai-draft-generator";
import { generateLocalDrafts } from "../src/lib/draft-generator";
import { shouldUseAi } from "../src/lib/draft-policy";
import { loadRelevantKnowledge } from "../src/lib/knowledge";
import { loadActivePrompt } from "../src/lib/prompts";
import { loadClientContext, resolveOpportunityClient } from "../src/lib/client-context";
import { detectCrossClientTerms, validateClientScopedActors } from "../src/lib/guardrails";
import { triageOpportunity } from "../src/lib/opportunity-triage";
import { loadObservedProfileContext, recordObservedProfileEvent } from "../src/lib/observed-profiles";
import { classifyJurispediaSafety, isJurispediaAutoPublishAllowed } from "../src/lib/jurispedia-policy";
import { loadRelevantCompetitorEvidence } from "../src/lib/competitor-evidence";
import { findSimilarDraft } from "../src/lib/draft-uniqueness";

loadEnv();

const prisma = new PrismaClient();

function parseArgs() {
  const limitIndex = process.argv.indexOf("--limit");
  const clientIndex = process.argv.indexOf("--client");
  const opportunityIndex = process.argv.indexOf("--opportunity-id");
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
    useAi: process.argv.includes("--use-ai") || process.env.npm_config_use_ai === "true",
    allPersonas: process.argv.includes("--all-personas") || process.env.npm_config_all_personas === "true",
    draftOnly: process.argv.includes("--draft-only"),
    replacePending: process.argv.includes("--replace-pending"),
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1] || 50) : Number(process.env.npm_config_limit || 50),
    clientSlug: clientIndex >= 0 ? process.argv[clientIndex + 1] : process.env.npm_config_client || null,
    opportunityId: opportunityIndex >= 0 ? process.argv[opportunityIndex + 1] : null,
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

  const whereClause: any = {
    status: { in: args.opportunityId ? ["NEW", "NEEDS_REVIEW", "DRAFTED"] : ["NEW", "NEEDS_REVIEW"] },
    OR: [
      { priority: { in: ["URGENT", "HIGH", "MEDIUM"] } },
      { signalType: "contextual_presence", opportunityScore: { gte: 40 } },
      {
        client: { slug: "prestige-running" },
        priority: "LOW",
        signalType: { in: ["actionable_question", "contextual_presence"] },
      },
    ],
  };
  if (args.opportunityId) whereClause.id = args.opportunityId;
  if (!args.replacePending) whereClause.responses = { none: {} };

  if (args.clientSlug) {
    whereClause.client = { slug: args.clientSlug };
  }

  const candidates = await prisma.opportunity.findMany({
    where: whereClause,
    include: {
      channel: true,
      detectedBrand: { include: { client: true } },
      detectedProduct: true,
      monitoredSource: { include: { client: true } },
      client: { select: { slug: true } },
    },
    orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
    take: args.limit * 4,
  });

  const opportunities = candidates
    .map((opportunity) => ({ opportunity, triage: triageOpportunity({ ...opportunity, clientSlug: opportunity.client?.slug }) }))
    .filter((row) => row.triage.action === "keep")
    .sort((a, b) => b.triage.score - a.triage.score)
    .slice(0, args.limit)
    .map((row) => row.opportunity);

  if (args.replacePending && !args.dryRun && opportunities.length > 0) {
    const snapshot = await prisma.response.findMany({
      where: { opportunityId: { in: opportunities.map((opportunity) => opportunity.id) } },
      orderBy: { createdAt: "asc" },
    });
    await mkdir(join(process.cwd(), "reports"), { recursive: true });
    const path = join(process.cwd(), "reports", `draft-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(path, JSON.stringify({ command: "draft-worker", replacePending: true, opportunities: opportunities.map((opportunity) => opportunity.id), responses: snapshot }, null, 2), "utf8");
    console.log(`Backup de borradores: ${path}`);
  }

  let drafted = 0;
  let aiUsed = 0;
  let localUsed = 0;
  let uniquenessRetries = 0;
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
  const workerId = `draft-${process.pid}-${randomUUID().slice(0, 8)}`;
  const prestigeUniqueAttempts = Math.max(1, Number(process.env.PRESTIGE_DRAFT_UNIQUENESS_ATTEMPTS || 8));
  const knownDraftsByClient = new Map<string, Set<string>>();

  for (const opportunity of opportunities) {
    let resolution: Awaited<ReturnType<typeof resolveOpportunityClient>>;
    let clientContext: Awaited<ReturnType<typeof loadClientContext>>;
    try {
      resolution = await resolveOpportunityClient(prisma, opportunity);
      clientContext = await loadClientContext(prisma, resolution.client.id, opportunity);
      if (!args.dryRun) {
        await prisma.draftJob.upsert({
          where: { opportunityId: opportunity.id },
          update: {},
          create: { opportunityId: opportunity.id, clientId: resolution.client.id },
        });
        const claimed = await prisma.draftJob.updateMany({
          where: {
            opportunityId: opportunity.id,
            OR: [
              { status: "QUEUED" },
              { status: "FAILED", attempts: { lt: 3 } },
              { status: "PROCESSING", leaseUntil: { lt: new Date() } },
              ...(args.replacePending ? [{ status: "COMPLETED" as const }] : []),
            ],
          },
          data: {
            status: "PROCESSING",
            lockedBy: workerId,
            leaseUntil: new Date(Date.now() + 10 * 60 * 1000),
            attempts: { increment: 1 },
            lastError: "",
          },
        });
        if (claimed.count === 0) continue;
      }
      await recordObservedProfileEvent(prisma, {
        opportunityId: opportunity.id,
        clientId: resolution.client.id,
        platform: opportunity.channel.name,
        sourceAuthor: opportunity.sourceAuthor,
        sourceText: opportunity.sourceText,
        sourceUrl: opportunity.sourceUrl,
        detectedIntent: opportunity.detectedIntent,
        priority: opportunity.priority,
        createdAt: opportunity.createdAt,
      });
    } catch (error) {
      errors.push({ opportunityId: opportunity.id, error: `cliente/contexto: ${(error as Error).message}` });
      continue;
    }

    if (resolution.client.slug === "jurispedia") {
      const legalSafety = classifyJurispediaSafety(opportunity.sourceText);
      if (!legalSafety.allowed) {
        if (!args.dryRun) {
          await prisma.opportunity.update({
            where: { id: opportunity.id },
            data: { status: "DISCARDED", notes: [opportunity.notes, `Jurispedia: ${legalSafety.reason}`].filter(Boolean).join(" ") },
          });
          await prisma.draftJob.updateMany({ where: { opportunityId: opportunity.id, lockedBy: workerId }, data: { status: "COMPLETED", leaseUntil: null } });
        }
        routing.push({ opportunityId: opportunity.id, clientId: resolution.client.id, clientSlug: resolution.client.slug, confidence: resolution.confidence, clientReason: resolution.reason, persona: "", reason: legalSafety.reason, source: "jurispedia-policy" });
        continue;
      }
    }

    const brand = clientContext.brand;
    const personaByName = new Map(clientContext.personas.map((p) => [p.name, p]));
    let knowledge: Awaited<ReturnType<typeof loadRelevantKnowledge>>["knowledge"];
    let objections: Awaited<ReturnType<typeof loadRelevantKnowledge>>["objections"];
    let activeSystemPrompt: Awaited<ReturnType<typeof loadActivePrompt>>;
    let observedProfile;
    let competitorEvidence;
    try {
      const [knowledgeResult, promptResult, observedProfileResult, evidenceResult] = await Promise.all([
        loadRelevantKnowledge(prisma, {
          sourceText: opportunity.sourceText,
          clientId: resolution.client.id,
          brandId: brand.id,
          productId: opportunity.detectedProductId,
        }),
        loadActivePrompt(prisma),
        loadObservedProfileContext(prisma, opportunity.id),
        loadRelevantCompetitorEvidence(prisma, resolution.client.id, opportunity.sourceText),
      ]);
      knowledge = knowledgeResult.knowledge;
      objections = knowledgeResult.objections;
      activeSystemPrompt = promptResult;
      observedProfile = observedProfileResult;
      competitorEvidence = evidenceResult;
    } catch (error) {
      errors.push({ opportunityId: opportunity.id, error: `carga de contexto: ${(error as Error).message}` });
      continue;
    }

    const suggestions = (await suggestAllPersonasForClient(prisma, opportunity, resolution.client.id, observedProfile))
      .slice(0, args.allPersonas ? undefined : 1);

    const allRows: {
      id: string;
      opportunityId: string;
      brandId: string;
      personaId: string;
      variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
      voiceVariant: string;
      voiceVariantReason: string;
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
          observedProfile,
          competitorEvidence,
        };
        let source = "local";
        // Para Jurispedia el contenido público se genera con la plantilla auditada;
        // no se usa IA generativa para evitar asesoramiento o citas inventadas.
        let variants;
        if (resolution.client.slug === "prestige-running") {
          if (!allowAi) {
            throw new Error("Prestige requiere IA para crear borradores únicos; ejecutá sin --dry-run o agregá --use-ai.");
          }

          let knownDrafts = knownDraftsByClient.get(resolution.client.id);
          if (!knownDrafts) {
            const existing = await prisma.response.findMany({
              where: { opportunity: { clientId: resolution.client.id } },
              select: { draftText: true, editedText: true },
            });
            knownDrafts = new Set(existing.flatMap((row) => [row.draftText, row.editedText]).filter(Boolean));
            knownDraftsByClient.set(resolution.client.id, knownDrafts);
          }

          type GeneratedVariant = {
            variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
            draftText: string;
            riskNotes: string;
          };
          const accepted = new Map<GeneratedVariant["variantType"], GeneratedVariant>();
          const rejected: string[] = [];
          for (let attempt = 1; attempt <= prestigeUniqueAttempts && accepted.size < 3; attempt++) {
            const generated = await generateAIDrafts({
              ...ctx,
              avoidDrafts: [...knownDrafts].slice(-30).concat(
                rejected.slice(-15),
                [...accepted.values()].map((item) => item.draftText),
              ),
            });
            if (!generated?.length) {
              uniquenessRetries++;
              continue;
            }
            for (const variant of generated) {
              if (accepted.has(variant.variantType)) continue;
              const comparisonPool = [
                ...knownDrafts,
                ...[...accepted.values()].map((item) => item.draftText),
              ];
              const similar = findSimilarDraft(variant.draftText, comparisonPool);
              if (similar) {
                rejected.push(variant.draftText, similar.text);
                continue;
              }
              accepted.set(variant.variantType, variant);
            }
            if (accepted.size < 3) uniquenessRetries++;
          }
          variants = [...accepted.values()];
          if (variants.length !== 3) {
            throw new Error(`La IA no logró 3 variantes únicas tras ${prestigeUniqueAttempts} intentos; no se guardaron plantillas repetidas.`);
          }
          for (const variant of variants) knownDrafts.add(variant.draftText);
          source = "ai-unique";
        } else {
          variants = resolution.client.slug === "jurispedia" ? null : (allowAi ? await generateAIDrafts(ctx) : null);
          if (variants && variants.length > 0) source = "ai";
          else variants = generateLocalDrafts(ctx);
        }
        if (source === "ai" || source === "ai-unique") aiUsed++;
        else localUsed++;

        routing.push({
          opportunityId: opportunity.id,
          clientId: resolution.client.id,
          clientSlug: resolution.client.slug,
          confidence: resolution.confidence,
          clientReason: resolution.reason,
          persona: persona.name,
          reason: suggestion.reason,
          voiceVariant: suggestion.voiceVariant ?? "",
          voiceVariantReason: suggestion.voiceVariantReason ?? "",
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
            voiceVariant: suggestion.voiceVariant ?? "",
            voiceVariantReason: suggestion.voiceVariantReason ?? "",
            draftText: v.draftText,
            riskNotes,
          });
        }
      } catch (error) {
        errors.push({ opportunityId: opportunity.id, error: `persona ${persona.name}: ${(error as Error).message}` });
        opportunityHadError = true;
      }
    }

    if (allRows.length === 0) {
      if (!args.dryRun) await prisma.draftJob.updateMany({ where: { opportunityId: opportunity.id, lockedBy: workerId }, data: { status: "FAILED", leaseUntil: null, lastError: "No se generaron variantes válidas." } });
      continue;
    }

    if (args.dryRun) {
      drafted += allRows.length;
      continue;
    }

    let approvedResponseId: string | null = null;
    let approvedAccount: string | null = null;
    const channelSetting = resolution.client.slug === "jurispedia"
      ? await prisma.appSetting.findUnique({ where: { key: `jurispedia.autopublish.${opportunity.channel.name.toLowerCase()}` } })
      : null;
    const legalPublish = isJurispediaAutoPublishAllowed({
      clientSlug: resolution.client.slug,
      opportunity,
      channel: opportunity.channel,
      channelEnabled: channelSetting?.value === "true",
    });
    const contextualPresence = opportunity.signalType === "contextual_presence";
    const autoApprove = !args.draftOnly && !args.replacePending && !contextualPresence && resolution.client.autoApprove && !opportunityHadError && resolution.confidence === "high" && legalPublish.allowed;
    const autoPublish = !args.draftOnly && !args.replacePending && !contextualPresence && resolution.client.autoPublish && !opportunityHadError && resolution.confidence === "high" && legalPublish.allowed;

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
        : (opportunityHadError || resolution.confidence === "low" || !legalPublish.allowed ? "NEEDS_REVIEW" : "DRAFTED");

      await prisma.$transaction([
        ...(args.replacePending ? [
          prisma.response.deleteMany({
            where: {
              opportunityId: opportunity.id,
              approvedBy: "",
              editedText: "",
              publishingLog: null,
            },
          }),
        ] : []),
        prisma.response.createMany({ data: allRows }),
        prisma.opportunity.update({
          where: { id: opportunity.id },
          data: {
            detectedBrandId: brand.id,
            status: args.replacePending ? "DRAFTED" : opportunityStatus,
            notes: !legalPublish.allowed ? [opportunity.notes, `Publicación automática bloqueada: ${legalPublish.reason}`].filter(Boolean).join(" ") : undefined,
          },
        }),
      ]);
      await prisma.draftJob.updateMany({ where: { opportunityId: opportunity.id, lockedBy: workerId }, data: { status: "COMPLETED", leaseUntil: null } });
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
      if (!args.dryRun) await prisma.draftJob.updateMany({ where: { opportunityId: opportunity.id, lockedBy: workerId }, data: { status: "FAILED", leaseUntil: null, lastError: (error as Error).message.slice(0, 1000) } });
    }
  }

  const report = writeReport("draft-worker", {
    command: "draft",
    dry_run: args.dryRun,
    opportunities_read: opportunities.length,
    drafts_created: drafted,
    ai_used: aiUsed,
    local_used: localUsed,
    uniqueness_retries: uniquenessRetries,
    all_personas: args.allPersonas,
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

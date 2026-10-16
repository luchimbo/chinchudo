import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { generateAICopilotDraft, shortenCopilotText } from "./ai-draft-generator";
import { generateLocalDrafts } from "./draft-generator";
import { ensureRequiredBrandMention, sanitizeCopilotDraft } from "./draft-output";
import { loadClientContext } from "./client-context";
import { loadRelevantKnowledge } from "./knowledge";
import { loadActivePrompt } from "./prompts";
import { getAcceptedExamples, getClientMemories } from "./client-memory";
import { loadObservedProfileContext } from "./observed-profiles";
import { loadRelevantCompetitorEvidence } from "./competitor-evidence";
import { validateClientScopedActors, detectCrossClientTerms } from "./guardrails";
import { operationalOpportunityWhere } from "./opportunity-channels";
import { classifyJurispediaSafety } from "./jurispedia-policy";
import { deriveCopilotApproach, pickCopilotPersona, copilotGuidance } from "./cm-editorial";
import { cmCoverageStatus, cmHasHumanWork, cmHash, cmInputHash, cmIsFresh, cmObject, cmSelectBatch, cmStamp } from "./cm-freshness";
import { loadCMVersion } from "./cm-version";

export const CM_ACTIVE_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] as const;
const LEASE_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;

export type CMMaintenanceState = { version: string; input: string; attempts: number; error: string; retryAt: string; day: string };
export function cmState(value: string | undefined): CMMaintenanceState | null {
  try {
    const state = JSON.parse(value || "null");
    return state && typeof state.version === "string" && typeof state.input === "string"
      && Number.isInteger(state.attempts) && typeof state.error === "string" && typeof state.retryAt === "string"
      && typeof state.day === "string" ? state : null;
  } catch { return null; }
}
export function cmDay(now = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10);
}
export function cmCanRetry(state: CMMaintenanceState | null, version: string, input: string, now = new Date()) {
  if (!state || state.version !== version || state.input !== input || !state.error) return true;
  if (state.day !== cmDay(now)) return true;
  return state.attempts < MAX_ATTEMPTS && Date.parse(state.retryAt) <= now.getTime();
}

export async function loadCMCoverage(db: PrismaClient, clientId: string, version?: string) {
  const [currentVersion, opportunities, states] = await Promise.all([
    version ? Promise.resolve(version) : loadCMVersion(db, clientId),
    db.opportunity.findMany({
      where: { clientId, ...operationalOpportunityWhere(), status: { in: [...CM_ACTIVE_STATUSES] }, publishingLogs: { none: {} } },
      select: { id: true, sourceText: true, sourceTitle: true, channelId: true, detectedIntent: true, detectedProductId: true, detectedBrandId: true,
        contextAssessment: true, priority: true, createdAt: true,
        responses: { orderBy: { createdAt: "desc" }, select: { id: true, evidence: true, editedText: true, approvedBy: true,
          acceptedAsCorrectAt: true, isPrimary: true, chatHistory: true, publishingLog: { select: { id: true } } } } },
    }),
    db.appSetting.findMany({ where: { key: { startsWith: `cm.maintenance.error.${clientId}.` } } }),
  ]);
  const stateMap = new Map(states.map((row) => [row.key, cmState(row.value)]));
  const rows = opportunities.map((opportunity) => {
    const state = stateMap.get(`cm.maintenance.error.${clientId}.${opportunity.id}`) ?? null;
    const input = cmInputHash(opportunity);
    const failed = Boolean(state?.error && state.version === currentVersion && state.input === input);
    return { ...opportunity, status: cmCoverageStatus(opportunity.responses, currentVersion, opportunity, failed),
      retryAllowed: cmCanRetry(state, currentVersion, input), error: failed ? state!.error : "" };
  });
  const counts = { missing: 0, stale: 0, fresh: 0, review: 0, error: 0, total: rows.length };
  for (const row of rows) counts[row.status]++;
  return { version: currentVersion, rows, counts };
}

const include = {
  channel: true, detectedBrand: true, detectedProduct: true,
  responses: { orderBy: { createdAt: "desc" as const }, include: { publishingLog: true } },
} satisfies Prisma.OpportunityInclude;

/** No public publishing call is reachable from this maintenance path. */
export async function refreshCMOpportunity(db: PrismaClient, clientId: string, id: string, owner: string = randomUUID()) {
  const before = await db.opportunity.findUniqueOrThrow({ where: { id }, include });
  if (before.clientId !== clientId || !CM_ACTIVE_STATUSES.includes(before.status as typeof CM_ACTIVE_STATUSES[number])
    || before.responses.some((response) => response.publishingLog)) return "skipped";
  const version = await loadCMVersion(db, clientId);
  if (before.responses.some((response) => cmIsFresh(response.evidence, version, before))) return "skipped";
  const input = cmInputHash(before);
  const stateKey = `cm.maintenance.error.${clientId}.${id}`;
  const previousState = cmState((await db.appSetting.findUnique({ where: { key: stateKey } }))?.value);
  if (!cmCanRetry(previousState, version, input)) return "skipped";
  await db.draftJob.upsert({ where: { opportunityId: id }, create: { opportunityId: id, clientId }, update: {} });
  const claim = await db.draftJob.updateMany({ where: { opportunityId: id, clientId,
    OR: [{ status: { not: "PROCESSING" } }, { leaseUntil: { lt: new Date() } }] },
    data: { status: "PROCESSING", lockedBy: owner, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 }, lastError: "" } });
  if (!claim.count) return "skipped";

  const heartbeat = setInterval(() => {
    db.draftJob.updateMany({ where: { opportunityId: id, lockedBy: owner, status: "PROCESSING" },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
  }, 30_000);
  try {
    const context = await loadClientContext(db, clientId, before);
    const selected = before.responses.find((response) => response.isPrimary) ?? before.responses[0];
    const copilot = cmObject(cmObject(before.contextAssessment).copilot);
    const choice = cmObject(copilot.productChoice);
    const hasChoice = choice.productId === null || typeof choice.productId === "string";
    const product = hasChoice
      ? context.catalogProducts.find((entry) => entry.id === choice.productId) ?? null
      : context.detectedProduct;
    if (typeof choice.productId === "string" && !product) throw new Error("El producto elegido ya no está en el catálogo. Revisá la selección.");
    const brand = product ? context.catalogProducts.find((entry) => entry.id === product.id)!.brand
      : context.brand;
    const approach = deriveCopilotApproach(before);
    const goal = ["RESPONDER", "VENDER", "CUIDAR"].includes(String(copilot.goal)) ? copilot.goal as typeof approach.goal : approach.goal;
    const style = ["NORMAL", "CON_ONDA", "CON_CUIDADO"].includes(String(copilot.style)) ? copilot.style as typeof approach.style : approach.style;
    const persona = context.personas.find((entry) => entry.id === selected?.personaId)
      ?? pickCopilotPersona(context.personas, goal, style);
    if (!persona) throw new Error("Falta configurar una voz editorial para este cliente.");
    const actors = validateClientScopedActors({ client: context.client, brand, persona });
    if (!actors.ok) throw new Error(actors.riskNotes.join("; "));
    if (context.client.slug === "jurispedia") {
      const safety = classifyJurispediaSafety(before.sourceText);
      if (!safety.allowed) throw new Error(safety.reason);
    }
    const [{ knowledge, objections }, activeSystemPrompt, memories, acceptedExamples, observedProfile, competitorEvidence] = await Promise.all([
      loadRelevantKnowledge(db, { sourceText: before.sourceText, clientId, brandId: brand.id, productId: product?.id }),
      loadActivePrompt(db), getClientMemories(db, clientId, { brandId: brand.id, productId: product?.id }),
      getAcceptedExamples(db, { clientId, brandId: brand.id, limit: 5 }), loadObservedProfileContext(db, id),
      loadRelevantCompetitorEvidence(db, clientId, before.sourceText),
    ]);
    const history = Array.isArray(selected?.chatHistory) ? selected.chatHistory : [];
    const refinementGuidance = history.map(cmObject).filter((message) => message.sender === "user" && typeof message.text === "string")
      .map((message) => String(message.text)).slice(-20);
    if (selected && cmHasHumanWork(selected)) refinementGuidance.push(`Conservá el criterio de esta respuesta revisada por el operador y actualizá solo lo necesario: ${selected.editedText || selected.draftText}`);
    const ctx = {
      opportunity: { ...before, detectedBrand: brand, detectedProduct: product, detectedProductId: product?.id ?? null },
      client: context.client, brand, persona, catalogProducts: hasChoice ? (product ? [product] : []) : context.catalogProducts.filter((entry) => entry.brandId === brand.id),
      services: context.services.filter((entry) => entry.brandId === brand.id), catalogRules: context.catalogRules,
      knowledge, objections, activeSystemPrompt, clientMemories: memories.map((memory) => ({ rule: memory.rule })),
      acceptedExamples, observedProfile, competitorEvidence, refinementGuidance,
      editorialGuidance: copilotGuidance({ copilot: { goal, style } }), productChosenByCm: hasChoice && Boolean(product),
    };
    const ai = context.client.slug === "jurispedia" ? null : await generateAICopilotDraft(ctx);
    // Maintenance retries outages instead of replacing a human draft with a local template.
    if (!ai && context.client.slug !== "jurispedia") throw new Error("La IA no devolvió una propuesta válida. Se conserva la respuesta anterior.");
    const draft = ai ?? generateLocalDrafts(ctx).find((variant) => variant.variantType === "SHORT");
    if (!draft) throw new Error("No se pudo generar una respuesta segura.");
    const text = ensureRequiredBrandMention(shortenCopilotText(sanitizeCopilotDraft(draft.draftText, context.client.slug)), context.client.slug);
    const crossClient = await detectCrossClientTerms(db, clientId, text);
    if (crossClient.length) throw new Error(`La propuesta mezcla datos de otro cliente: ${crossClient.join("; ")}`);
    // Prompt/catalog may have changed while the model was thinking.
    if (await loadCMVersion(db, clientId) !== version) return "changed";
    const result = await db.$transaction(async (tx) => {
      const current = await tx.opportunity.findUniqueOrThrow({ where: { id }, include });
      const lease = await tx.draftJob.findUnique({ where: { opportunityId: id } });
      if (lease?.lockedBy !== owner || !lease.leaseUntil || lease.leaseUntil < new Date()
        || current.clientId !== clientId || !CM_ACTIVE_STATUSES.includes(current.status as typeof CM_ACTIVE_STATUSES[number])
        || cmInputHash(current) !== input || current.updatedAt.getTime() !== before.updatedAt.getTime()
        || cmHash(current.responses) !== cmHash(before.responses)) return "changed";
      const protectedResponse = selected && cmHasHumanWork(selected);
      // Keep every prior response and chat in Postgres. The new proposal requires human review.
      if (!protectedResponse) await tx.response.updateMany({ where: { opportunityId: id }, data: { isPrimary: false } });
      else await tx.response.update({ where: { id: selected.id }, data: { isPrimary: true } });
      await tx.response.create({ data: {
        opportunityId: id, brandId: brand.id, personaId: persona.id, variantType: "SHORT", draftText: text,
        riskNotes: draft.riskNotes, isPrimary: !protectedResponse, evidence: [cmStamp(version, current, ai ? "ai" : "local")],
        // Corrections inform generation; the original chat remains attached to its original response.
        chatHistory: selected?.chatHistory ?? [],
      } });
      await tx.opportunity.update({ where: { id }, data: { status: protectedResponse ? current.status : "DRAFTED" } });
      await tx.appSetting.upsert({ where: { key: stateKey }, create: { key: stateKey, value: "null" }, update: { value: "null" } });
      return protectedResponse ? "review" : "generated";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const same = previousState?.version === version && previousState.input === input && previousState.day === cmDay();
    const attempts = same ? previousState!.attempts + 1 : 1;
    const value = JSON.stringify({ version, input, attempts, error: message.slice(0, 1000),
      retryAt: new Date(Date.now() + attempts * 15 * 60_000).toISOString(), day: cmDay() } satisfies CMMaintenanceState);
    await db.appSetting.upsert({ where: { key: stateKey }, create: { key: stateKey, value }, update: { value } });
    await db.draftJob.updateMany({ where: { opportunityId: id, lockedBy: owner },
      data: { status: "FAILED", leaseUntil: null, lastError: message.slice(0, 1000) } });
    throw error;
  } finally {
    clearInterval(heartbeat);
    await db.draftJob.updateMany({ where: { opportunityId: id, lockedBy: owner, status: "PROCESSING" },
      data: { status: "COMPLETED", leaseUntil: null } });
  }
}

export async function runCMMaintenance(db: PrismaClient, options: { limit: number; dailyLimit: number; clientSlug?: string; dryRun?: boolean }) {
  const clients = await db.client.findMany({ where: { active: true, ...(options.clientSlug ? { slug: options.clientSlug } : {}) }, orderBy: { slug: "asc" }, select: { id: true, slug: true } });
  const results = [];
  for (const client of clients) {
    const coverage = await loadCMCoverage(db, client.id);
    const budgetKey = `cm.maintenance.budget.${client.id}.${cmDay()}`;
    const setting = await db.appSetting.findUnique({ where: { key: budgetKey } });
    const spent = Math.max(0, Number(setting?.value) || 0);
    const remaining = Math.max(0, options.dailyLimit - spent);
    const batch = cmSelectBatch(coverage.rows.filter((row) => row.retryAllowed), Math.min(options.limit, remaining));
    const outcomes: { id: string; status: string; error?: string }[] = [];
    for (const row of batch) {
      if (options.dryRun) { outcomes.push({ id: row.id, status: row.status }); continue; }
      // Count attempts, including model failures, so retries cannot bypass the cost cap.
      const value = String(spent + outcomes.length + 1);
      await db.appSetting.upsert({ where: { key: budgetKey }, create: { key: budgetKey, value }, update: { value } });
      try { outcomes.push({ id: row.id, status: await refreshCMOpportunity(db, client.id, row.id) }); }
      catch (error) { outcomes.push({ id: row.id, status: "error", error: error instanceof Error ? error.message : String(error) }); }
    }
    results.push({ client: client.slug, before: coverage.counts, budget_remaining: remaining, outcomes });
  }
  return results;
}

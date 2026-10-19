import type { Client, Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DEFAULT_MARKET, marketSchema, monthAfter, patchProfile, type BusinessProfileData, type ProfilePatch } from "./business-analysis";
import { analyzePublicWebsite, mergeManualFields, parseDomainKeywords, sanitizeDraft, syncOnboarding, syncOnboardingCatalog, type WebsiteAnalysis } from "./onboarding";
import { confirmedDraftFor, readConfirmedSnapshot, rehydrateDraftFromConfirmed } from "./onboarding-rehydrate";

export const jsonData = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

// A website sample can include 100 offerings. Catalog writes use this same
// transaction, with no network work, and need time for the remote DB round trips.
const profileTransactionOptions = { timeout: 120000, maxWait: 10000 };

// Reuse onboarding's transaction without opening a nested transaction. All
// profile/context writers take the same tenant lock before reading corrections.
export function transactionDatabase(tx: Prisma.TransactionClient): PrismaClient {
  return new Proxy(tx, { get(target, key) {
    if (key === "$transaction") return (callback: (inner: Prisma.TransactionClient) => unknown) => callback(tx);
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as PrismaClient;
}

export function mergeUserBusinessDraft(draft: Required<import("./onboarding").OnboardingDraft>, previous: BusinessProfileData, changedFields: string[]) {
  const protectedDraft = { ...previous.draft, manualFields: previous.draft.manualFields.filter(field => !changedFields.includes(field)), offerings: changedFields.includes("offerings") ? [] : previous.draft.offerings };
  return { ...mergeManualFields(draft, protectedDraft), firstUseGoal: draft.firstUseGoal, welcomeCompleted: draft.welcomeCompleted };
}
export function readBusinessProfile(value: unknown, name: string): BusinessProfileData {
  const raw = value && typeof value === "object" ? value as Partial<BusinessProfileData> : {};
  const list = (items: unknown): string[] => Array.isArray(items) ? items.filter((v): v is string => typeof v === "string") : [];
  return { draft: sanitizeDraft(raw.draft, name), market: marketSchema.safeParse(raw.market).success ? marketSchema.parse(raw.market) : { ...DEFAULT_MARKET }, priorities: list(raw.priorities), exclusions: list(raw.exclusions), differentiators: list(raw.differentiators), manualFields: list(raw.manualFields) };
}
export async function ensureBusinessProfile(db: PrismaClient, client: Client) {
  const existing = await db.businessProfile.findUnique({ where: { clientId: client.id } });
  if (existing) return existing;
  const onboarding = await db.clientOnboarding.findUnique({ where: { clientId: client.id } });
  let draft = await confirmedDraftFor(db, client, onboarding);
  if (!onboarding) draft = rehydrateDraftFromConfirmed(draft, await readConfirmedSnapshot(db, client, draft));
  const data: BusinessProfileData = { draft, market: draft.market, priorities: draft.priorities, exclusions: parseDomainKeywords(client.domainExclusions), differentiators: draft.differentiators, manualFields: onboarding?.status === "COMPLETED" || !onboarding ? ["description", "offer", "targetAudience", "exclusions", ...(draft.priorities.length ? ["priorities"] : []), ...(draft.differentiators.length ? ["differentiators"] : [])] : [] };
  // Protect legacy configuration: it was curated before this feature existed.
  if (onboarding?.status === "COMPLETED" || !onboarding) data.draft.manualFields = [...new Set([...draft.manualFields, "name", "brand", "description", "offer", "targetAudience", "tone", "topics", "claims", "limits", "knowledge"])];
  data.draft.exclusions = data.exclusions;
  data.draft.manualFields = [...new Set([...data.draft.manualFields, ...data.manualFields])];
  return db.businessProfile.upsert({ where: { clientId: client.id }, create: { clientId: client.id, sourceUrl: onboarding?.sourceUrl || client.storeUrl, data: jsonData(data) }, update: {} });
}
export async function enqueueBusinessAnalysis(db: PrismaClient, client: Client, sourceUrl?: string, market?: unknown) {
  const profile = await ensureBusinessProfile(db, client);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const active = await tx.businessAnalysisRun.findFirst({ where: { clientId: client.id, status: { in: ["QUEUED", "RUNNING"] } } });
    if (active) return active;
    const url = sourceUrl === undefined ? profile.sourceUrl : sourceUrl;
    if (market) {
      const parsed = marketSchema.parse(market);
      const fresh = await tx.businessProfile.findUniqueOrThrow({ where: { clientId: client.id } });
      const data = patchProfile(readBusinessProfile(fresh.data, client.name), { market: parsed });
      await tx.businessProfile.update({ where: { clientId: client.id }, data: { data: jsonData(data), sourceUrl: url } });
    } else await tx.businessProfile.update({ where: { clientId: client.id }, data: { sourceUrl: url } });
    return tx.businessAnalysisRun.create({ data: { clientId: client.id, sourceUrl: url } });
  });
}
export function mergeAnalyzedProfile(fresh: Required<import("./onboarding").OnboardingDraft>, previous: BusinessProfileData): BusinessProfileData {
  const draft = mergeManualFields(fresh, previous.draft);
  if (fresh.stats.catalogStatus === "deferred") {
    // Reading general pages says nothing about the freshness of existing products.
    draft.offerings = previous.draft.offerings;
    draft.stats = { ...draft.stats, products: previous.draft.stats.products, services: previous.draft.stats.services,
      importedProducts: previous.draft.stats.importedProducts, importedServices: previous.draft.stats.importedServices,
      catalogStatus: previous.draft.stats.catalogStatus || "deferred", catalogNextOffset: previous.draft.stats.catalogNextOffset,
      catalogSyncPending: previous.draft.stats.catalogSyncPending };
    return { ...previous, draft, differentiators: previous.manualFields.includes("differentiators") ? previous.differentiators : draft.differentiators,
      priorities: previous.manualFields.includes("priorities") ? previous.priorities : draft.priorities };
  }
  const observed = new Set(draft.offerings.map(item => `${item.kind}:${item.id}`));
  // Sampling a smaller catalog is not evidence that the business stopped
  // selling an offering. Keep it visible with an explicit freshness warning.
  draft.offerings = [...draft.offerings, ...previous.draft.offerings.filter(item => !observed.has(`${item.kind}:${item.id}`)).map(item => ({ ...item, evidence: { ...item.evidence, status: "needs_confirmation" as const, confidence: "low" as const } }))];
  return { ...previous, draft, differentiators: previous.manualFields.includes("differentiators") ? previous.differentiators : draft.differentiators, priorities: previous.manualFields.includes("priorities") ? previous.priorities : [...new Set(draft.offerings.filter(o => o.selected).map(o => o.category || o.name))].slice(0, 40) };
}
export async function applyBusinessProfile(db: PrismaClient, client: Client, data: BusinessProfileData, skipCatalog = false) {
  const draft = sanitizeDraft({ ...data.draft, name: client.name, market: data.market, priorities: data.priorities, exclusions: data.exclusions, differentiators: data.differentiators, knowledgeApproved: false }, client.name);
  // Sync catalog/context, but never grant high confidence to AI-written knowledge or enable publication.
  await syncOnboarding(db, client.id, draft, { preserveCommercialTerms: true, skipCatalog });
  await db.client.update({ where: { id: client.id }, data: { domainExclusions: JSON.stringify(data.exclusions), domainKeywords: JSON.stringify([...new Set([...data.priorities, ...draft.topics])].slice(0, 40)) } });
  await db.appSetting.upsert({ where: { key: `blog_editorial_exclusions:${client.id}` }, create: { key: `blog_editorial_exclusions:${client.id}`, value: JSON.stringify(data.exclusions) }, update: { value: JSON.stringify(data.exclusions) } });
  return draft;
}
export async function editBusinessProfile(db: PrismaClient, client: Client, patch: ProfilePatch) {
  await ensureBusinessProfile(db, client);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const profile = await tx.businessProfile.findUniqueOrThrow({ where: { clientId: client.id } });
    const data = patchProfile(readBusinessProfile(profile.data, client.name), patch);
    data.draft = await applyBusinessProfile(transactionDatabase(tx), client, data);
    const updated = await tx.businessProfile.update({ where: { id: profile.id }, data: { data: jsonData(data) } });
    await tx.clientOnboarding.updateMany({ where: { clientId: client.id }, data: { draft: jsonData(data.draft) } });
    return updated;
  }, profileTransactionOptions);
}
export async function saveAnalyzedProfile(db: PrismaClient, client: Client, fresh: Required<import("./onboarding").OnboardingDraft>, runId: string) {
  await ensureBusinessProfile(db, client);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const row = await tx.businessProfile.findUniqueOrThrow({ where: { clientId: client.id } });
    const data = mergeAnalyzedProfile(fresh, readBusinessProfile(row.data, client.name));
    data.draft.analysisRunId = runId;
    data.draft = await applyBusinessProfile(transactionDatabase(tx), client, data, fresh.stats.catalogStatus === "deferred");
    const now = new Date();
    await tx.businessProfile.update({ where: { id: row.id }, data: { data: jsonData(data), lastSuccessfulAt: now, nextAnalysisAt: monthAfter(now, data.market.timezone) } });
    await tx.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, sourceUrl: row.sourceUrl, draft: jsonData(data.draft), status: "IN_REVIEW", currentStep: 2 }, update: { sourceUrl: row.sourceUrl, draft: jsonData(data.draft), analysisError: "" } });
    return data;
  }, profileTransactionOptions);
}

/** Publish the small profile and seed the existing queue atomically. No catalog writes. */
export async function saveBasicAnalysis(db: PrismaClient, client: Client, analysis: WebsiteAnalysis, sourceUrl: string, market?: unknown) {
  await ensureBusinessProfile(db, client);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const row = await tx.businessProfile.findUniqueOrThrow({ where: { clientId: client.id } });
    const active = await tx.businessAnalysisRun.findFirst({ where: { clientId: client.id, status: { in: ["QUEUED", "RUNNING"] } } });
    if (active?.status === "RUNNING" && active.stage === "website") throw new Error("Ya hay una lectura del sitio en curso. Intentá de nuevo cuando termine.");
    if (active && active.sourceUrl !== sourceUrl) throw new Error("Hay un análisis de otra web en curso. Esperá a que termine antes de cambiar la dirección.");
    const previous = readBusinessProfile(row.data, client.name);
    const data = mergeAnalyzedProfile(analysis.draft, previous);
    if (market) data.market = marketSchema.parse(market);
    data.draft = sanitizeDraft({ ...data.draft, market: data.market, priorities: data.priorities, analysisRunId: active?.id || randomUUID(), knowledgeApproved: false }, client.name);
    const now = new Date();
    await tx.businessProfile.update({ where: { id: row.id }, data: { sourceUrl, data: jsonData(data), lastSuccessfulAt: now, nextAnalysisAt: monthAfter(now, data.market.timezone) } });
    await tx.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, sourceUrl, draft: jsonData(data.draft), status: "IN_REVIEW", currentStep: 2 }, update: { sourceUrl, draft: jsonData(data.draft), analysisError: "" } });
    const own = { domain: new URL(sourceUrl).hostname.replace(/^www\./, ""), description: data.draft.description, offer: data.draft.offer,
      audience: data.draft.targetAudience, categories: data.priorities, topics: data.draft.topics,
      pages: analysis.pages.map(({ url, title, pageType, seo, fetchedAt }) => ({ url, title, pageType, seo, fetchedAt })) };
    const seed = { stage: "competitors", checkpoint: jsonData({ own: true }), result: jsonData({ own, profileSnapshot: data, pagesRead: analysis.pages.length, discarded: analysis.draft.stats.pagesDiscarded }) };
    let run = active;
    if (active?.status === "QUEUED" && active.stage === "website") {
      // The worker claims runs without taking the client lock. Never overwrite a run it just claimed.
      const seeded = await tx.businessAnalysisRun.updateMany({ where: { id: active.id, status: "QUEUED", stage: "website" }, data: seed });
      if (!seeded.count) throw new Error("Ya hay una lectura del sitio en curso. Intentá de nuevo cuando termine.");
      run = await tx.businessAnalysisRun.findUniqueOrThrow({ where: { id: active.id } });
    }
    if (!run) run = await tx.businessAnalysisRun.create({ data: { id: data.draft.analysisRunId, clientId: client.id, sourceUrl, ...seed } });
    return { draft: data.draft, run };
  }, { timeout: 15000, maxWait: 3000 });
}

/** A catalog batch never owns business copy, manual selections or commercial terms. */
export function mergeCatalogBatch(current: Required<import("./onboarding").OnboardingDraft>, batch: Required<import("./onboarding").OnboardingDraft>) {
  const byIdentity = new Map(current.offerings.map(item => [`${item.kind}:${item.id}`, item]));
  for (const item of batch.offerings) {
    const key = `${item.kind}:${item.id}`;
    const existing = byIdentity.get(key) || current.offerings.find(previous => previous.kind === item.kind && (previous.url && previous.url === item.url || previous.name.toLowerCase() === item.name.toLowerCase()));
    if (existing) {
      if (existing.evidence.status === "manual" || current.manualFields.includes(`offering:${existing.id}`)) continue;
      byIdentity.set(`${existing.kind}:${existing.id}`, { ...item, id: existing.id, selected: existing.selected, price: existing.price, availability: existing.availability });
    } else byIdentity.set(key, item);
  }
  return sanitizeDraft({ ...current, offerings: [...byIdentity.values()], stats: { ...current.stats,
    catalogStatus: batch.stats.catalogStatus, catalogNextOffset: batch.stats.catalogNextOffset, catalogSyncPending: batch.stats.catalogSyncPending,
    products: [...byIdentity.values()].filter(item => item.kind === "product").length,
    services: [...byIdentity.values()].filter(item => item.kind === "service").length,
  } });
}

export async function analyzeRequestedCatalog(db: PrismaClient, client: Client, signal?: AbortSignal) {
  const onboarding = await db.clientOnboarding.findUnique({ where: { clientId: client.id } });
  if (onboarding?.status !== "COMPLETED") throw new Error("Activá el negocio antes de analizar productos.");
  if (!onboarding.sourceUrl) throw new Error("Agregá una web para analizar productos.");
  const previous = sanitizeDraft(onboarding.draft, client.name);
  const analysis = await analyzePublicWebsite(onboarding.sourceUrl, client.name, { mode: "catalog", candidateOffset: previous.stats.catalogStatus === "complete" ? 0 : previous.stats.catalogNextOffset, skipSuggestions: true, signal });
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const latest = await tx.clientOnboarding.findUniqueOrThrow({ where: { clientId: client.id } });
    const current = sanitizeDraft(latest.draft, client.name);
    if (latest.status !== "COMPLETED" || latest.sourceUrl !== onboarding.sourceUrl || current.stats.catalogNextOffset !== previous.stats.catalogNextOffset || current.stats.catalogStatus !== previous.stats.catalogStatus) throw new Error("El catálogo cambió durante la lectura. Volvé a intentarlo.");
    const profile = await tx.businessProfile.findUnique({ where: { clientId: client.id } });
    const data = profile ? readBusinessProfile(profile.data, client.name) : null;
    const draft = mergeCatalogBatch(current, analysis.draft);
    // Sync only observed records; do not rewrite the previous catalog on every batch.
    const observed = analysis.draft.offerings;
    const batchDraft = mergeCatalogBatch({ ...current, offerings: current.offerings.filter(item => observed.some(incoming => incoming.kind === item.kind &&
      (incoming.id === item.id || incoming.url && incoming.url === item.url || incoming.name.toLowerCase() === item.name.toLowerCase()))) }, analysis.draft);
    const imported = await syncOnboardingCatalog(transactionDatabase(tx), client.id, batchDraft, true);
    draft.stats.importedProducts = (current.stats.importedProducts || 0) + imported.products;
    draft.stats.importedServices = (current.stats.importedServices || 0) + imported.services;
    await tx.clientOnboarding.update({ where: { id: latest.id }, data: { draft: jsonData(draft), analysisError: "" } });
    if (data && profile) await tx.businessProfile.update({ where: { id: profile.id }, data: { data: jsonData({ ...data, draft: { ...data.draft, offerings: draft.offerings, stats: draft.stats } }) } });
    return { draft, warning: analysis.warning };
  }, profileTransactionOptions);
}
export async function syncBusinessDraft(db: PrismaClient, client: Client, draft: Required<import("./onboarding").OnboardingDraft>, changedFields: string[] = [], resetManualCorrections = false, options: { applyContext?: boolean } = {}) {
  await ensureBusinessProfile(db, client);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const row = await tx.businessProfile.findUniqueOrThrow({ where: { clientId: client.id } });
    const previous = readBusinessProfile(row.data, client.name);
    if (resetManualCorrections) {
      previous.draft.manualFields = draft.manualFields;
      previous.manualFields = previous.manualFields.filter(field => ["market", "priorities", "exclusions", "differentiators"].includes(field));
    }
    const merged = mergeUserBusinessDraft(draft, previous, changedFields);
    const data: BusinessProfileData = { ...previous, draft: merged, market: merged.market, priorities: merged.priorities, exclusions: merged.exclusions, differentiators: merged.differentiators, manualFields: [...new Set([...previous.manualFields, ...merged.manualFields])] };
    if (options.applyContext !== false) data.draft = await applyBusinessProfile(transactionDatabase(tx), client, data);
    await tx.businessProfile.update({ where: { id: row.id }, data: { data: jsonData(data) } });
    await tx.clientOnboarding.updateMany({ where: { clientId: client.id }, data: { draft: jsonData(data.draft) } });
    return data.draft;
  }, profileTransactionOptions);
}

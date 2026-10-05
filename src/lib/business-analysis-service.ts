import type { Client, Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_MARKET, marketSchema, monthAfter, patchProfile, type BusinessProfileData, type ProfilePatch } from "./business-analysis";
import { mergeManualFields, parseDomainKeywords, sanitizeDraft, syncOnboarding } from "./onboarding";
import { confirmedDraftFor, readConfirmedSnapshot, rehydrateDraftFromConfirmed } from "./onboarding-rehydrate";

export const jsonData = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

// Reuse onboarding's transaction without opening a nested transaction. All
// profile/context writers take the same tenant lock before reading corrections.
function transactionDatabase(tx: Prisma.TransactionClient): PrismaClient {
  return new Proxy(tx, { get(target, key) {
    if (key === "$transaction") return (callback: (inner: Prisma.TransactionClient) => unknown) => callback(tx);
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as PrismaClient;
}

export function mergeUserBusinessDraft(draft: Required<import("./onboarding").OnboardingDraft>, previous: BusinessProfileData, changedFields: string[]) {
  const protectedDraft = { ...previous.draft, manualFields: previous.draft.manualFields.filter(field => !changedFields.includes(field)), offerings: changedFields.includes("offerings") ? [] : previous.draft.offerings };
  return mergeManualFields(draft, protectedDraft);
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
  const observed = new Set(draft.offerings.map(item => `${item.kind}:${item.id}`));
  // Sampling a smaller catalog is not evidence that the business stopped
  // selling an offering. Keep it visible with an explicit freshness warning.
  draft.offerings = [...draft.offerings, ...previous.draft.offerings.filter(item => !observed.has(`${item.kind}:${item.id}`)).map(item => ({ ...item, evidence: { ...item.evidence, status: "needs_confirmation" as const, confidence: "low" as const } }))];
  return { ...previous, draft, differentiators: previous.manualFields.includes("differentiators") ? previous.differentiators : draft.differentiators, priorities: previous.manualFields.includes("priorities") ? previous.priorities : [...new Set(draft.offerings.filter(o => o.selected).map(o => o.category || o.name))].slice(0, 40) };
}
export async function applyBusinessProfile(db: PrismaClient, client: Client, data: BusinessProfileData) {
  const draft = sanitizeDraft({ ...data.draft, name: client.name, market: data.market, priorities: data.priorities, exclusions: data.exclusions, differentiators: data.differentiators, knowledgeApproved: false }, client.name);
  // Sync catalog/context, but never grant high confidence to AI-written knowledge or enable publication.
  await syncOnboarding(db, client.id, draft, { preserveCommercialTerms: true });
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
  }, { timeout: 30000 });
}
export async function saveAnalyzedProfile(db: PrismaClient, client: Client, fresh: Required<import("./onboarding").OnboardingDraft>, runId: string) {
  await ensureBusinessProfile(db, client);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
    const row = await tx.businessProfile.findUniqueOrThrow({ where: { clientId: client.id } });
    const data = mergeAnalyzedProfile(fresh, readBusinessProfile(row.data, client.name));
    data.draft.analysisRunId = runId;
    data.draft = await applyBusinessProfile(transactionDatabase(tx), client, data);
    const now = new Date();
    await tx.businessProfile.update({ where: { id: row.id }, data: { data: jsonData(data), lastSuccessfulAt: now, nextAnalysisAt: monthAfter(now, data.market.timezone) } });
    await tx.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, sourceUrl: row.sourceUrl, draft: jsonData(data.draft), status: "IN_REVIEW", currentStep: 2 }, update: { sourceUrl: row.sourceUrl, draft: jsonData(data.draft), analysisError: "" } });
    return data;
  }, { timeout: 30000 });
}
export async function syncBusinessDraft(db: PrismaClient, client: Client, draft: Required<import("./onboarding").OnboardingDraft>, changedFields: string[] = [], resetManualCorrections = false) {
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
    data.draft = await applyBusinessProfile(transactionDatabase(tx), client, data);
    await tx.businessProfile.update({ where: { id: row.id }, data: { data: jsonData(data) } });
    await tx.clientOnboarding.updateMany({ where: { clientId: client.id }, data: { draft: jsonData(data.draft) } });
    return data.draft;
  }, { timeout: 30000 });
}

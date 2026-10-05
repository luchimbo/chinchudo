import { z } from "zod";
import type { OnboardingDraft } from "./onboarding";

const text = z.string().trim().max(2000);
export const marketSchema = z.object({
  country: z.string().trim().min(1).max(80).default("Argentina"),
  language: z.string().trim().min(1).max(80).default("Español latinoamericano"),
  reach: z.enum(["national", "local"]).default("national"),
  city: z.string().trim().max(120).default(""),
  timezone: z.string().max(80).default("America/Argentina/Buenos_Aires").refine(value => {
    try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; }
  }, "Zona horaria inválida"),
});
export type BusinessMarket = z.infer<typeof marketSchema>;
export const DEFAULT_MARKET: BusinessMarket = marketSchema.parse({});
export function businessTimezone(responsePolicy: unknown): string {
  const policy = responsePolicy && typeof responsePolicy === "object" ? responsePolicy as Record<string, unknown> : {};
  const market = marketSchema.safeParse(policy.businessMarket || {});
  return market.success ? market.data.timezone : DEFAULT_MARKET.timezone;
}
export const profilePatchSchema = z.object({
  description: text.optional(), offer: text.optional(), targetAudience: text.optional(),
  priorities: z.array(z.string().trim().min(1).max(180)).max(40).optional(),
  exclusions: z.array(z.string().trim().min(1).max(180)).max(40).optional(),
  differentiators: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  market: marketSchema.optional(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type BusinessProfileData = {
  draft: Required<OnboardingDraft>;
  market: BusinessMarket;
  priorities: string[];
  exclusions: string[];
  differentiators: string[];
  manualFields: string[];
};
export type SeoFinding = { field: string; severity: "warning" | "info"; evidence: string; recommendation: string };
export type PageSeo = {
  title: string; description: string; h1: string[]; h2: string[];
  canonical: string; robots: string; structuredTypes: string[]; malformedStructuredData: boolean;
  findings: SeoFinding[];
};
export type AnalyzedSite = {
  domain: string; description: string; offer: string; audience: string; categories: string[];
  topics: string[]; pages: Array<{ url: string; title: string; pageType: string; fetchedAt: string; seo?: PageSeo }>;
};
export type ContentOpportunity = { keyword: string; title: string; category: string; reason: string; sourceUrls: string[]; interpretation: true };
export type AnalysisResult = {
  own?: AnalyzedSite; competitors?: AnalyzedSite[]; opportunities?: ContentOpportunity[];
  changes?: string[]; pagesRead?: number; discarded?: number;
  articlesCreated?: number; datesPending?: number;
  profileSnapshot?: BusinessProfileData;
  differences?: Array<{ field: string; before: unknown; after: unknown }>;
};

export function monthAfter(value: Date, timezone = DEFAULT_MARKET.timezone): Date {
  const wallTime = (date: Date) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map(p => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second, date.getUTCMilliseconds());
  };
  const result = new Date(wallTime(value));
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  const target = result.getTime();
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) instant += target - wallTime(new Date(instant));
  return new Date(instant);
}
export function localDay(value: Date, timezone = DEFAULT_MARKET.timezone): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function analysisWeek(value: Date, timezone = DEFAULT_MARKET.timezone): string[] {
  const day = new Date(`${localDay(value, timezone)}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => new Date(day.getTime() + offset * 86400000).toISOString().slice(0, 10));
}
export function competitorDomain(value: string): string {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || url.hostname === "localhost" || url.hostname.endsWith(".local") || !url.hostname.includes(".")) throw new Error("Ingresá un dominio público válido.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
export function topicKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function freshOpportunities(items: ContentOpportunity[], existing: string[], exclusions: string[]): ContentOpportunity[] {
  const seen = new Set(existing.map(topicKey));
  const banned = exclusions.map(topicKey).filter(Boolean);
  return items.filter(item => {
    const key = topicKey(item.keyword);
    if (!key || seen.has(key) || banned.some(term => (` ${topicKey(`${item.keyword} ${item.title} ${item.category}`)} `).includes(` ${term} `))) return false;
    const words = new Set(key.split(" "));
    if ([...seen].some(other => {
      const tokens = new Set(other.split(" "));
      const common = [...words].filter(w => tokens.has(w)).length;
      return common / Math.max(words.size, tokens.size) >= 0.8;
    })) return false;
    seen.add(key); return true;
  });
}
export function patchProfile(current: BusinessProfileData, patch: ProfilePatch): BusinessProfileData {
  const result = { ...current, draft: { ...current.draft }, manualFields: [...new Set([...current.manualFields, ...Object.keys(patch)])] };
  for (const field of ["description", "offer", "targetAudience"] as const) if (patch[field] !== undefined) {
    result.draft[field] = patch[field]!;
    result.draft.manualFields = [...new Set([...result.draft.manualFields, field])];
  }
  for (const field of ["market", "priorities", "exclusions", "differentiators"] as const) if (patch[field] !== undefined) {
    Object.assign(result, { [field]: patch[field] });
    Object.assign(result.draft, { [field]: patch[field] });
    result.draft.manualFields = [...new Set([...result.draft.manualFields, field])];
  }
  return result;
}

import { prisma } from "@/lib/db";
import { buildSwipeSummary } from "@/lib/reel-craft";

/** Plataformas que traen referencias de video (Inspiración). */
export const VIDEO_REFERENCE_PLATFORMS = ["TIKTOK", "TIKTOK_HASHTAG", "TIKTOK_CREATIVE_CENTER", "INSTAGRAM", "YOUTUBE", "VIRAL_MARKETING"];
/** Plataformas de coyuntura (Tema del día). */
export const CONTEXT_PLATFORMS = ["GOOGLE_NEWS", "ARGENTINE_STREAMING_MEDIA", "ARGENTINE_PRESS", "ARGENTINA_DATA", "URL_ARTICLE", "PODCAST", "GOOGLE_TRENDS", "TWITTER"];

export const REFERENCE_WINDOW_DAYS = 30;

export async function loadVideoReferences(clientId: string, days = REFERENCE_WINDOW_DAYS) {
  return prisma.trend.findMany({
    where: { clientId, platform: { in: VIDEO_REFERENCE_PLATFORMS }, createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function loadSwipeSummary(clientId: string) {
  const references = await loadVideoReferences(clientId);
  return { references, summary: buildSwipeSummary(references) };
}

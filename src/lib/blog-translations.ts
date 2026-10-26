import type { Prisma, PrismaClient } from "@prisma/client";
import { BLOG_LANGUAGES, blogLanguage, type BlogLanguage } from "@/lib/blog-language";

type Db = PrismaClient | Prisma.TransactionClient;

/** El blog se reconstruye completo; esta marca pide un despliegue sin artículo puntual (p. ej. tras borrar). */
export const blogRedeployKey = (clientId: string) => `blog_redeploy_pending:${clientId}`;
/** Cola de traducciones que el relay procesa de a una. */
export const blogTranslationQueueKey = (clientId: string) => `blog_translation_queue:${clientId}`;

export type TranslationRequest = { landingId: string; language: BlogLanguage; requestedAt: string; attempts: number; error?: string };

export function parseTranslationQueue(value: string | null | undefined): TranslationRequest[] {
  try {
    const rows = JSON.parse(value || "[]");
    if (!Array.isArray(rows)) return [];
    return rows.flatMap(row => row && typeof row.landingId === "string" && BLOG_LANGUAGES.some(item => item.value === row.language)
      ? [{ landingId: row.landingId, language: row.language as BlogLanguage, requestedAt: String(row.requestedAt || ""), attempts: Number(row.attempts) || 0, ...(row.error ? { error: String(row.error) } : {}) }]
      : []);
  } catch { return []; }
}

/** Las traducciones guardan en su JSON el id del original (`translation_of`). */
export function translationOfFilter(landingId: string): Prisma.LandingWhereInput {
  return { OR: [{ htmlContent: { contains: `"translation_of":"${landingId}"` } }, { htmlContent: { contains: `"translation_of": "${landingId}"` } }] };
}

export function articleLanguageInfo(htmlContent: string): { language: BlogLanguage; translationOf: string | null } {
  try {
    const content = JSON.parse(htmlContent);
    return { language: blogLanguage(content?.language), translationOf: typeof content?.translation_of === "string" ? content.translation_of : null };
  } catch { return { language: "es", translationOf: null }; }
}

export async function findTranslations(db: Db, clientId: string, landingId: string, { includeArchived = false } = {}) {
  const rows = await db.landing.findMany({ where: { clientId, ...(!includeArchived ? { status: { not: "ARCHIVED" } } : {}), ...translationOfFilter(landingId) }, select: { id: true, titulo: true, status: true, slug: true, htmlContent: true } });
  // `contains` es una búsqueda de texto: se confirma con el JSON real.
  return rows.flatMap(row => { const info = articleLanguageInfo(row.htmlContent); return info.translationOf === landingId ? [{ id: row.id, titulo: row.titulo, status: row.status, slug: row.slug, language: info.language }] : []; });
}

export async function requestBlogRedeploy(db: Db, clientId: string) {
  const key = blogRedeployKey(clientId), value = new Date().toISOString();
  await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

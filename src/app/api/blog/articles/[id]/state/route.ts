import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { findTranslations, blogTranslationQueueKey, parseTranslationQueue } from "@/lib/blog-translations";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const client = await resolveClientForSlug(prisma, new URL(request.url).searchParams.get("client"));
    const article = await prisma.landing.findFirst({ where: { id: params.id, clientId: client.id }, select: { id: true } });
    if (!article) return NextResponse.json({ error: "Artículo no disponible." }, { status: 404 });
    const [translations, setting] = await Promise.all([findTranslations(prisma, client.id, article.id), prisma.appSetting.findUnique({ where: { key: blogTranslationQueueKey(client.id) }, select: { value: true } })]);
    return NextResponse.json({ translations, pending: parseTranslationQueue(setting?.value).filter(item => item.landingId === article.id).map(item => ({ language: item.language, ...(item.error ? { error: item.error } : {}) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}

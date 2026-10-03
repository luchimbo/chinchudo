import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { renderLandingHtml } from "@/lib/landing-html";
import { draftFromContent, mergeDraft, type ArticleDraft } from "@/lib/article-edit";
import { editableArticleContent, loadBlogEvidence } from "@/lib/blog-evidence";

export const runtime = "nodejs";

// Tanto la versión guardada como el borrador usan la plantilla real del blog.
async function previewArticle(request: Request, articleId: string, withDraft: boolean) {
  const landing = await prisma.landing.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      htmlContent: true,
      client: {
        select: {
          id: true, name: true, slug: true, storeUrl: true, blogBaseUrl: true, labName: true, logoUrl: true,
          landingTemplate: true, landingPrimaryColor: true, landingSecondaryColor: true,
        },
      },
    },
  });
  if (!landing) return new NextResponse("Artículo no encontrado.", { status: 404 });
  try {
    await assertClientAccess(prisma, landing.client.id);
  } catch {
    return new NextResponse("Sin acceso al artículo.", { status: 403 });
  }

  let content: Record<string, any>;
  let draft: ArticleDraft | undefined;
  try {
    content = editableArticleContent(JSON.parse(landing.htmlContent));
    if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Contenido inválido");
    if (withDraft) {
      const body = await request.json();
      draft = { ...draftFromContent(content), ...(body?.draft ?? {}) };
    }
  } catch {
    return new NextResponse(withDraft ? "Borrador inválido." : "Contenido del artículo inválido.", { status: 400 });
  }

  try {
    let preview = content;
    if (draft) {
      const evidence = await loadBlogEvidence(prisma, landing.client.id);
      preview = mergeDraft(content, draft);
      const sourceIds = draft.sourceIds;
      preview.source_refs = evidence.sources.filter((s) => sourceIds?.includes(s.id));
    }
    const html = await renderLandingHtml(landing.client, landing.id, preview);
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(`No se pudo generar la vista previa.\n${message}`, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return previewArticle(request, params.id, false);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return previewArticle(request, params.id, true);
}

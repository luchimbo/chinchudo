import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { renderLandingHtml } from "@/lib/landing-html";
import { draftFromContent, mergeDraft, type ArticleDraft } from "@/lib/article-edit";
import { editableArticleContent, loadBlogEvidence } from "@/lib/blog-evidence";

export const runtime = "nodejs";

// Vista previa del editor de artículos: renderiza el borrador sin guardar con
// la plantilla real del blog.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const landing = await prisma.landing.findUnique({
    where: { id: params.id },
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
  let draft: ArticleDraft;
  try {
    content = editableArticleContent(JSON.parse(landing.htmlContent));
    const body = await request.json();
    draft = { ...draftFromContent(content), ...(body?.draft ?? {}) };
  } catch {
    return new NextResponse("Borrador inválido.", { status: 400 });
  }

  try {
    const evidence = await loadBlogEvidence(prisma, landing.client.id);
    const preview = mergeDraft(content, draft);
    preview.source_refs = evidence.sources.filter((s) => draft.sourceIds?.includes(s.id));
    const html = await renderLandingHtml(landing.client, landing.id, preview);
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(`No se pudo generar la vista previa.\n${message}`, { status: 500 });
  }
}

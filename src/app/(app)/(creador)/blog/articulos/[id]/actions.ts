"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { applyArticleDraft, draftFromContent, type ArticleDraft } from "@/lib/article-edit";
import { completeArticle } from "@/lib/article-completion.mjs";
import { loadArticleCatalog } from "@/lib/article-catalog";
import { editableArticleContent, inspectBlogArticle, loadBlogEvidence } from "@/lib/blog-evidence";
import type { EditorialQuality } from "@/lib/blog-quality.mjs";
import { parseMarkers } from "@/lib/article-markers";

export type SaveArticleResult = { ok: true; updatedAt: string; redeploy: boolean; quality: EditorialQuality; draft: ArticleDraft } | { ok: false; error: string };

export async function saveBlogArticle(input: { id: string; expectedUpdatedAt: string; draft: ArticleDraft }): Promise<SaveArticleResult> {
  const landing = await prisma.landing.findUnique({ where: { id: input.id }, include: { client: { select: { slug: true } }, blogPublication: true } });
  if (!landing || (!landing.blogPublication && !["GUIDE", "PILLAR"].includes(landing.contentType))) return { ok: false, error: "Artículo editorial no encontrado." };
  try {
    await assertClientAccess(prisma, landing.clientId);
  } catch {
    return { ok: false, error: "No tenés acceso a este artículo." };
  }
  if (landing.blogPublication?.status === "PUBLISHING") return { ok: false, error: "Esperá a que termine la publicación." };
  if (landing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    return { ok: false, error: "El artículo cambió desde que lo abriste (otra edición o una regeneración). Recargá la página para ver la versión actual." };
  }

  let content: Record<string, any>;
  try { content = JSON.parse(landing.htmlContent); } catch { return { ok: false, error: "El artículo no tiene una estructura editable." }; }
  if (content.deployment_started_at && Date.parse(content.deployment_started_at) > Date.now() - 15 * 60000) return { ok: false, error: "Esperá a que termine el despliegue de la revisión." };
  const [catalog, evidence] = await Promise.all([loadArticleCatalog(prisma, landing.clientId, landing.id), loadBlogEvidence(prisma, landing.clientId)]);
  catalog.sources = evidence.sources.map((s) => ({ ref: s.id, name: s.title }));
  if (Array.isArray(content.editorial_brief?.allowedProductIds)) catalog.products = catalog.products.filter(p => content.editorial_brief.allowedProductIds.includes(p.ref));
  const result = applyArticleDraft(editableArticleContent(content), input.draft, catalog);
  if (!result.ok) return result;
  result.content = completeArticle({ content: result.content, catalog, sources: evidence.sources }).content;
  result.draft = draftFromContent(result.content);
  const cited = parseMarkers(JSON.stringify(result.content)).filter((m) => m.kind === "s").map((m) => m.ref);
  const ids = [...new Set([...(result.draft.sourceIds || []), ...cited, ...(result.content.decision_support?.options || []).flatMap((o: any) => o.evidence_ids || [])])];
  result.content.source_refs = ids.map((id) => evidence.sources.find((s) => s.id === id) || { id });
  const quality = await inspectBlogArticle(prisma, landing.clientId, result.content, landing.id);
  result.content.editorial_quality = quality;

  const published = landing.blogPublication?.status === "PUBLISHED" || (!landing.blogPublication && landing.status === "PUBLISHED");
  const redeploy = published && quality.publishable;
  let updated: { updatedAt: Date };
  try { updated = await prisma.$transaction(async (tx) => {
    if (landing.blogPublication) {
      const slots = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text FROM "BlogPublication" WHERE id = ${landing.blogPublication.id} FOR UPDATE`;
      if (!slots.length || slots[0].status === "PUBLISHING" || slots[0].status !== landing.blogPublication.status) throw new Error("El estado cambió. Recargá el artículo.");
    }
    const changed = await tx.landing.updateMany({
      where: { id: landing.id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: published ? { htmlContent: JSON.stringify({ ...content, deployment_started_at: undefined, revision_attempts: 0, deployment_error: "", pending_revision: { content: result.content, savedAt: new Date().toISOString(), publishable: quality.publishable } }) } : {
        ...(landing.blogPublication?.analysisRunId ? { status: "DRAFT" } : {}),
        titulo: result.draft.h1, keyword: result.draft.keyword, seoTitle: result.draft.seoTitle,
        seoDescription: result.draft.description, htmlContent: JSON.stringify(result.content), sourceRefs: result.content.source_refs,
      },
    });
    if (changed.count !== 1) throw new Error("Otra edición guardó cambios. Recargá la página antes de continuar.");
    const saved = await tx.landing.findUniqueOrThrow({
      where: { id: landing.id },
      select: { updatedAt: true },
    });
    const errors = quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ").slice(0, 2000);
    if (landing.blogPublication) await tx.blogPublication.update({ where: { id: landing.blogPublication.id }, data: published
      ? { needsDeploy: redeploy, revisionAttempts: 0, lastError: errors }
      : { ...(landing.blogPublication.analysisRunId ? { requiresApproval: true, approvedAt: null } : {}), status: quality.publishable ? "READY" : "FAILED", attempts: quality.publishable ? 0 : 3, lastError: errors } });
    return saved;
  }); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar el artículo." }; }
  revalidatePath(`/blog/articulos/${landing.id}`);
  revalidatePath("/blog/calendario");
  return { ok: true, updatedAt: updated.updatedAt.toISOString(), redeploy, quality, draft: result.draft };
}

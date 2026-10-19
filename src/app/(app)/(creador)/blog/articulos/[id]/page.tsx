import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { draftFromContent } from "@/lib/article-edit";
import { loadArticleCatalog } from "@/lib/article-catalog";
import { ArticleEditor } from "./article-editor";
import { saveBlogArticle } from "./actions";
import { editableArticleContent, loadBlogEvidence } from "@/lib/blog-evidence";
import { articleBackHref } from "@/lib/blog-navigation";
import { blogLanguage } from "@/lib/blog-language";
import { blogTranslationQueueKey, findTranslations, parseTranslationQueue } from "@/lib/blog-translations";
import { TranslationsPanel } from "./translations-panel";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  PLANNED: { label: "Preparando", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  READY: { label: "Preparado", tone: "border-sky-200 bg-sky-50 text-sky-800" },
  PUBLISHING: { label: "Publicando", tone: "border-violet-200 bg-violet-50 text-violet-800" },
  PUBLISHED: { label: "Publicado", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  FAILED: { label: "Revisar", tone: "border-rose-200 bg-rose-50 text-rose-800" },
  SKIPPED: { label: "Omitido", tone: "border-ink/10 bg-ink/5 text-slate" },
};

export default async function BlogArticleEditorPage({ params, searchParams }: { params: { id: string }; searchParams: { calendarMonth?: string; calendarDay?: string } }) {
  const landing = await prisma.landing.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { slug: true, blogBaseUrl: true } },
      blogPublication: true,
      contentCluster: { select: { name: true, slug: true } },
    },
  });
  if (!landing || (!landing.blogPublication && !["GUIDE", "PILLAR"].includes(landing.contentType))) notFound();
  try { await assertClientAccess(prisma, landing.clientId); } catch { notFound(); }
  let content: Record<string, any>;
  try { content = JSON.parse(landing.htmlContent); } catch { notFound(); }
  content = editableArticleContent(content);

  const slot = landing.blogPublication || { scheduledDate: landing.publishedAt || landing.createdAt, status: landing.status === "PUBLISHED" ? "PUBLISHED" : "READY", needsDeploy: Boolean(JSON.parse(landing.htmlContent).pending_revision?.publishable), lastError: JSON.parse(landing.htmlContent).deployment_error || "" };
  const scheduled = slot.scheduledDate.toISOString().slice(0, 10);
  const [catalog, evidence] = await Promise.all([loadArticleCatalog(prisma, landing.clientId, landing.id), loadBlogEvidence(prisma, landing.clientId)]);
  catalog.sources = evidence.sources.map((s) => ({ ref: s.id, name: s.title, detail: s.type }));
  if (Array.isArray(content.editorial_brief?.allowedProductIds)) catalog.products = catalog.products.filter((p) => content.editorial_brief.allowedProductIds.includes(p.ref));
  const blogBase = (landing.client.blogBaseUrl || (landing.client.slug === "pcmidi" ? "https://blog.pcmidicenter.com" : "")).replace(/\/$/, "");
  const locale = ["en", "de"].includes(content.language) ? `/${content.language}` : "";
  const publicUrl = !blogBase ? "" : landing.contentCluster ? `${blogBase}${locale}/guias/${landing.contentCluster.slug}/${landing.slug}/` : `${blogBase}${locale}/${landing.slug}/`;
  const state = STATUS[slot.status] ?? STATUS.READY;
  const translationOf = typeof content.translation_of === "string" ? content.translation_of : null;
  const [translations, queueSetting, originalLanding] = await Promise.all([
    translationOf ? Promise.resolve([]) : findTranslations(prisma, landing.clientId, landing.id),
    translationOf ? Promise.resolve(null) : prisma.appSetting.findUnique({ where: { key: blogTranslationQueueKey(landing.clientId) } }),
    translationOf ? prisma.landing.findFirst({ where: { id: translationOf, clientId: landing.clientId }, select: { id: true, titulo: true } }) : Promise.resolve(null),
  ]);
  const pendingTranslations = parseTranslationQueue(queueSetting?.value).filter(item => item.landingId === landing.id).map(item => ({ language: item.language, ...(item.error ? { error: item.error } : {}) }));
  const backHref = articleBackHref(landing.client.slug, landing.blogPublication ? scheduled : undefined, searchParams.calendarMonth, searchParams.calendarDay);
  const dateLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(slot.scheduledDate);
  const note = slot.needsDeploy
    ? "Hay cambios guardados pendientes de actualizarse en el blog."
    : landing.blogPublication?.requiresApproval ? "Borrador privado: requiere aprobación humana."
    : slot.status === "PUBLISHED"
      ? "Las ediciones aprobadas se desplegarán con la misma URL."
      : slot.status === "PUBLISHING"
        ? "Se está publicando: esperá a que termine para guardar cambios."
        : "Privado hasta la fecha programada.";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <ArticleEditor
        articleId={landing.id}
        initialDraft={draftFromContent(content, landing)}
        updatedAt={landing.updatedAt.toISOString()}
        catalog={catalog}
        evidence={evidence}
        content={content}
        published={slot.status === "PUBLISHED"}
        publicUrl={publicUrl}
        backHref={backHref}
        clusterName={landing.contentCluster?.name || "Blog"}
        status={{ label: state.label, tone: state.tone, date: dateLabel, note }}
        save={saveBlogArticle}
      />
      <TranslationsPanel
        articleId={landing.id}
        language={blogLanguage(content.language)}
        original={translationOf ? (originalLanding ?? { id: translationOf, titulo: "" }) : null}
        translations={translations.map(({ id, titulo, language, status }) => ({ id, titulo, language, status }))}
        pending={pendingTranslations}
        client={landing.client.slug}
        deleteRedirect={backHref}
      />
    </main>
  );
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Client, PrismaClient } from "@prisma/client";
import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import { editorialIntentForDate } from "./blog-quality.mjs";
import { inspectBlogArticle } from "./blog-evidence";
import { completeBlogArticle } from "./complete-blog-article";
import { jsonData } from "./business-analysis-service";
import type { BusinessProfileData, ContentOpportunity } from "./business-analysis";

const articleSchema = z.object({
  h1: z.string().min(5).max(200), seo_title: z.string().min(5).max(200),
  meta_description: z.string().min(20).max(400), direct_answer: z.string().min(50).max(2000),
  sections: z.array(z.object({ h2: z.string().min(3).max(200), body: z.string().min(80).max(12000) })).min(4).max(6),
  common_mistakes: z.array(z.string().max(1000)).max(6).default([]),
  faqs: z.array(z.object({ q: z.string().min(5).max(300), a: z.string().min(20).max(2000) })).min(3).max(6),
  brand_solution: z.object({ title: z.string().max(200), body: z.string().max(2000) }),
});
export async function businessJson<T>(client: Client, system: string, input: unknown, schema: z.ZodType<T>, signal?: AbortSignal, maxTokens = 8000): Promise<T> {
  const config = resolveLLMConfig(client);
  const reasoning = config.provider === "openrouter" && (config.model === "deepseek/deepseek-v4-flash" || "BLOG_LLM_REASONING_ENABLED" in process.env)
    ? { reasoning: { enabled: process.env.BLOG_LLM_REASONING_ENABLED?.toLowerCase() === "true" } } : {};
  const completion = await fetchChatCompletion(config, {
    temperature: 0.25, max_tokens: maxTokens,
    response_format: { type: "json_object" },
    ...reasoning,
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
  }, "Cafishia Business Analysis", client, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
  if (!completion.response.ok) throw new Error(`La IA respondió ${completion.response.status}.`);
  const payload = await completion.response.json();
  const content = String(payload.choices?.[0]?.message?.content || "");
  const start = content.indexOf("{"), end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("La IA no devolvió un resultado válido.");
  let parsed: unknown;
  try { parsed = JSON.parse(content.slice(start, end + 1)); }
  catch { throw new Error(payload.choices?.[0]?.finish_reason === "length" ? "La IA agotó el límite de salida antes de completar el JSON. Reintentá la generación." : "La IA devolvió JSON inválido. Reintentá la generación."); }
  return schema.parse(parsed);
}

/** This path only persists private drafts. It never calls a builder/deployer/publisher. */
export async function generatePrivateBusinessArticle(db: PrismaClient, client: Client, profile: BusinessProfileData, topic: ContentOpportunity, slotId: string, signal?: AbortSignal, leaseToken?: string) {
  const slot = await db.blogPublication.findFirstOrThrow({ where: { id: slotId, clientId: client.id } });
  if (slot.landingId) return slot.landingId;
  if (!slot.requiresApproval || !slot.analysisRunId || !["PLANNED", "FAILED"].includes(slot.status)) throw new Error("La fecha no admite un borrador del análisis.");
  const [catalog, products] = await Promise.all([
    db.landingCategory.findMany({ where: { clientId: client.id, linkStatus: { not: "missing" } }, take: 100 }),
    db.landingProduct.findMany({ where: { clientId: client.id, linkStatus: { not: "missing" } }, take: 100 }),
  ]);
  const prompt = await readFile(join(process.cwd(), "prompts", "business-article-v1.txt"), "utf8");
  const generated = await businessJson(client, prompt, {
    topic, editorial_intent: editorialIntentForDate(slot.scheduledDate.toISOString().slice(0, 10)), name: client.name, description: profile.draft.description, audience: profile.draft.targetAudience,
    market: profile.market, exclusions: profile.exclusions, differentiators: profile.differentiators,
    offerings: profile.draft.offerings.filter(o => o.selected).map(o => ({ name: o.name, kind: o.kind, category: o.category, description: o.description, specs: o.specs, url: o.url, evidence: o.evidence })),
    catalog: catalog.map(c => ({ id: c.key, name: c.name })),
    products: products.map(p => ({ id: p.externalId, name: p.name, description: p.useText })),
  }, articleSchema, signal);
  signal?.throwIfAborted();
  const category = catalog.find(c => c.name.toLowerCase() === topic.category.toLowerCase()) || catalog[0];
  const slug = `analisis-${slot.analysisRunId}-${slot.scheduledDate.toISOString().slice(0, 10)}`;
  const rawContent = {
    ...generated, slug, keyword: topic.keyword, titulo: generated.h1, intro: generated.direct_answer, hero_lede: generated.direct_answer,
    editorial_intent: editorialIntentForDate(slot.scheduledDate.toISOString().slice(0, 10)), content_type: "GUIDE", indexing_state: "INDEX", author_name: `Equipo ${client.name}`,
    primary_category_id: category?.key || "", secondary_category_ids: [], product_ids: [],
    components: [], steps: [], source_refs: [], research_source_urls: topic.sourceUrls,
    generation_mode: "private-draft", analysis_run_id: slot.analysisRunId,
  };
  const { content } = await completeBlogArticle(db, client.id, rawContent);
  const quality = await inspectBlogArticle(db, client.id, content);
  signal?.throwIfAborted();
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ landingId: string | null; requiresApproval: boolean; status: string }>>`SELECT "landingId", "requiresApproval", status::text FROM "BlogPublication" WHERE id = ${slotId} AND "clientId" = ${client.id} FOR UPDATE`;
    if (rows[0]?.landingId) return rows[0].landingId;
    if (!rows[0]?.requiresApproval || !["PLANNED", "FAILED"].includes(rows[0].status)) throw new Error("La reserva editorial cambió durante la generación.");
    if (leaseToken) {
      const owned = await tx.businessAnalysisRun.findFirst({ where: { id: slot.analysisRunId!, clientId: client.id, status: "RUNNING", leaseToken, leaseExpiresAt: { gt: new Date() } } });
      if (!owned) throw new Error("La corrida fue retomada por otro worker.");
    }
    const duplicate = await tx.landing.findFirst({ where: { clientId: client.id, keyword: topic.keyword } });
    if (duplicate) throw new Error("La búsqueda ya tiene un artículo; elegí otro tema.");
    const cluster = await tx.contentCluster.upsert({
      where: { clientId_slug: { clientId: client.id, slug: category?.key || "guias" } },
      create: { clientId: client.id, slug: category?.key || "guias", name: category?.name || "Guías" }, update: {},
    });
    const article = await tx.landing.create({ data: {
      clientId: client.id, slug, keyword: topic.keyword, intent: content.editorial_intent, titulo: generated.h1,
      contentClusterId: cluster.id,
      htmlContent: JSON.stringify({ ...content, cluster_slug: cluster.slug, cluster_name: cluster.name, editorial_quality: quality }), seoTitle: content.seo_title,
      seoDescription: content.meta_description, status: "DRAFT", contentType: "GUIDE",
      authorName: `Equipo ${client.name}`, sourceRefs: jsonData(content.source_refs),
      // publicPreviewUrl/previewPublishedAt/publishedAt remain empty/null by construction.
    } });
    await tx.blogPublication.update({ where: { id: slotId }, data: { landingId: article.id, status: "READY", requiresApproval: true, approvedAt: null, lastError: quality.checks.filter(c => c.level === "error").map(c => c.message).join(" · ").slice(0, 2000) } });
    return article.id;
  }, { timeout: 30000 });
}

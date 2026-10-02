import { catalogSources, verifiedSources, reviewArticle } from "./blog-quality.mjs";

export async function loadBlogEvidence(prisma, clientId) {
  const [setting, rows, categoryRows, knowledge] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: `blog_editorial_sources:${clientId}` }, select: { value: true } }),
    prisma.landingProduct.findMany({ where: { clientId }, select: { externalId: true, name: true, url: true, useText: true, updatedAt: true } }),
    prisma.landingCategory.findMany({ where: { clientId }, select: { key: true, name: true } }),
    prisma.knowledgeBase.findMany({ where: { clientId, confidence: "high" }, select: { id: true, topic: true, content: true, source: true, updatedAt: true } }),
  ]);
  let stored = [];
  try { stored = JSON.parse(setting?.value || "[]"); } catch { /* Sin evidencia revisada. */ }
  const products = Object.fromEntries(rows.map((p) => [p.externalId, { nombre: p.name, url: p.url, uso: p.useText, updatedAt: p.updatedAt.toISOString() }]));
  const sources = [...catalogSources(products), ...verifiedSources(stored), ...knowledge.map((k) => ({
    id: `knowledge-${k.id}`, title: k.topic, type: "internal", url: "", reference: `Base de conocimiento: ${k.source}`,
    reviewedBy: "Base de conocimiento de confianza alta", verifiedAt: k.updatedAt.toISOString(), productIds: [], claims: k.content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
  }))];
  return { sources: verifiedSources(sources), products, categories: Object.fromEntries(categoryRows.map((c) => [c.key, { nombre: c.name }])), stored: verifiedSources(stored) };
}

export function editableArticleContent(content) { return content.pending_revision?.content || content; }

export async function inspectBlogArticle(prisma, clientId, content, excludeId) {
  const [evidence, rows] = await Promise.all([
    loadBlogEvidence(prisma, clientId),
    prisma.landing.findMany({ where: { clientId, status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, keyword: true, titulo: true, seoTitle: true, seoDescription: true, contentType: true } }),
  ]);
  const existing = rows.map((r) => ({ id: r.id, keyword: r.keyword, h1: r.titulo, seo_title: r.seoTitle, meta_description: r.seoDescription, content_type: r.contentType }));
  return reviewArticle({ content, ...evidence, existing });
}

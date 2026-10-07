import type { PrismaClient } from "@prisma/client";
import { loadArticleCatalog } from "./article-catalog";
import { loadBlogEvidence } from "./blog-evidence";
import { completeArticle } from "./article-completion.mjs";

export async function completeBlogArticle(db: PrismaClient, clientId: string, content: Record<string, any>, excludeId?: string) {
  const [catalog, evidence] = await Promise.all([loadArticleCatalog(db, clientId, excludeId), loadBlogEvidence(db, clientId)]);
  if (Array.isArray(content.editorial_brief?.allowedProductIds)) catalog.products = catalog.products.filter(p => content.editorial_brief.allowedProductIds.includes(p.ref));
  return completeArticle({ content, catalog, sources: evidence.sources });
}

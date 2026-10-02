import type { PrismaClient } from "@prisma/client";
import type { ArticleCatalog } from "./article-markers";

/** Destinos que un artículo puede enlazar: productos, categorías y guías publicadas. */
export async function loadArticleCatalog(prisma: PrismaClient, clientId: string, excludeLandingId?: string): Promise<ArticleCatalog> {
  const [products, categories, guides] = await Promise.all([
    prisma.landingProduct.findMany({ where: { clientId }, select: { externalId: true, name: true, brand: true, model: true }, orderBy: { name: "asc" } }),
    prisma.landingCategory.findMany({ where: { clientId }, select: { key: true, name: true }, orderBy: { name: "asc" } }),
    prisma.landing.findMany({
      where: { clientId, status: "PUBLISHED", contentClusterId: { not: null }, ...(excludeLandingId ? { id: { not: excludeLandingId } } : {}) },
      select: { slug: true, titulo: true, keyword: true, contentCluster: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
    }),
  ]);
  return {
    products: products.map((product) => ({
      ref: product.externalId,
      name: product.name,
      detail: [product.brand, product.model].filter(Boolean).join(" · ") || undefined,
    })),
    categories: categories.map((category) => ({ ref: category.key, name: category.name })),
    guides: guides.map((guide) => ({ ref: guide.slug, name: guide.titulo || guide.keyword || guide.slug, detail: guide.contentCluster?.name })),
  };
}

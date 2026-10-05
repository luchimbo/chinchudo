import type { PrismaClient } from "@prisma/client";
import type { ArticleCatalog } from "./article-markers";

/** Destinos que un artículo puede enlazar: productos, categorías y guías publicadas. */
export async function loadArticleCatalog(prisma: PrismaClient, clientId: string, excludeLandingId?: string): Promise<ArticleCatalog> {
  const [products, categories, guides] = await Promise.all([
    prisma.landingProduct.findMany({ where: { clientId }, select: { externalId: true, name: true, brand: true, model: true, linkStatus: true }, orderBy: { name: "asc" } }),
    prisma.landingCategory.findMany({ where: { clientId }, select: { key: true, name: true, linkStatus: true }, orderBy: { name: "asc" } }),
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
      disabled: product.linkStatus === "missing",
      detail: [product.brand, product.model, product.linkStatus === "missing" ? "Ficha retirada: se muestra sin enlace" : ""].filter(Boolean).join(" · ") || undefined,
    })),
    categories: categories.map((category) => ({ ref: category.key, name: category.name, disabled: category.linkStatus === "missing" })),
    guides: guides.map((guide) => ({ ref: guide.slug, name: guide.titulo || guide.keyword || guide.slug, detail: guide.contentCluster?.name })),
  };
}

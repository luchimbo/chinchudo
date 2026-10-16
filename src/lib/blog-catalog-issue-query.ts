import type { PrismaClient } from "@prisma/client";
import { catalogIssues } from "./blog-catalog-issues";
import { catalogUrl } from "./tiendanube-public";

export async function loadCatalogIssues(db: PrismaClient, clientId: string, verifiedRunId?: string) {
  const [baseline, products, categories] = await Promise.all([
    db.catalogSyncRun.findFirst({ where: { clientId, checkpoint: { path: ["discoveryComplete"], equals: true }, AND: { checkpoint: { path: ["applied"], equals: true } } }, orderBy: { startedAt: "desc" } }),
    db.landingProduct.findMany({ where: { clientId }, select: { id: true, name: true, url: true, linkStatus: true, externalId: true, brand: true, missingRuns: true } }),
    db.landingCategory.findMany({ where: { clientId }, select: { id: true, name: true, url: true, linkStatus: true, key: true, missingRuns: true } }),
  ]);
  if (!baseline) return catalogIssues([], products, categories);
  const resolutions = await db.catalogSyncRun.findMany({ where: { clientId, checkpoint: { path: ["resolvedFrom"], equals: baseline.id } }, orderBy: { startedAt: "desc" } });
  const runs = [...resolutions, baseline].map(run => run.id === verifiedRunId ? { ...run, deployment: { ...(run.deployment as object), verified: true } } : run);
  const rows = [...products, ...categories];
  const obsolete = ((baseline.errors || []) as Array<{ url?: string; status?: number }>).filter(error => error.url && [404,410].includes(error.status || 0) && !rows.some(row => catalogUrl(row.url) === catalogUrl(error.url!)));
  const unusedUrls = (await Promise.all(obsolete.map(async error => {
    const references = await db.landing.count({where:{clientId,htmlContent:{contains:catalogUrl(error.url!)}}});
    return references ? "" : error.url!;
  }))).filter(Boolean);
  return catalogIssues(runs, products, categories, unusedUrls);
}

import { catalogUrl } from "./tiendanube-public";
import type { SyncChange } from "./blog-catalog-sync";

type Row = { id: string; name: string; url: string; linkStatus: string; externalId?: string; key?: string; brand?: string; tiendanubeId?: string | null; missingRuns?: number };
type Run = { id: string; changes: unknown; errors: unknown; checkpoint: unknown; deployment: unknown; status: string };
export type CatalogIssue = { id: string; runId: string; ref?: string; kind: "product" | "category" | "link"; code: "CATALOG_AMBIGUOUS" | "CATALOG_MISSING" | "CATALOG_FETCH_FAILED"; name: string; url: string; message: string; candidates: Row[]; pending?: boolean; incoming?: { id: string; name: string; url: string; sku?: string; brand?: string } };

/** Read-only projection: historical failures remain evidence, not permanent open alerts. */
export function catalogIssues(runs: Run[], products: Row[], categories: Row[], unusedUrls: string[] = []) {
  const open: CatalogIssue[] = [], resolved: Array<{ name: string; url: string; reason: string }> = [];
  const baseline = runs.find(run => (run.checkpoint as any)?.discoveryComplete);
  if (!baseline) return { open, resolved };
  const rows = [...products, ...categories], changes = baseline.changes as SyncChange[];
  for (const change of changes.filter(c => c.action === "review" && c.incoming)) {
    const resolution = runs.find(run => (run.changes as SyncChange[]).some(c => c.resolvedFrom === baseline.id && c.reviewRef === change.ref));
    if ((resolution?.deployment as any)?.verified) { resolved.push({ name: change.name, url: change.afterUrl, reason: "Vinculación verificada" }); continue; }
    const incoming = change.incoming!;
    open.push({ id: `${baseline.id}:${change.ref}`, runId: baseline.id, ref: change.ref, kind: change.kind, code: "CATALOG_AMBIGUOUS", name: change.name, url: change.afterUrl, message: resolution ? "Vinculación guardada; falta verificarla en el blog." : "Hay más de una ficha posible. Elegí cuál corresponde.", candidates: (change.kind === "product" ? products : categories).filter(row => change.candidates?.includes(row.id)), pending: !!resolution, incoming: { id: incoming.id, name: incoming.name, url: incoming.url, sku: incoming.sku, brand: incoming.brand } });
  }
  for (const failure of (baseline.errors || []) as Array<{ url?: string; error: string; status?: number }>) {
    const url = failure.url || "";
    const matching = rows.filter(row => url && catalogUrl(row.url) === catalogUrl(url));
    const verified = (baseline.deployment as any)?.verified;
    const recovered = changes.some(c => c.beforeUrl && catalogUrl(c.beforeUrl) === catalogUrl(url) && c.afterUrl && catalogUrl(c.afterUrl) !== catalogUrl(url) && c.action === "update");
    const unused = unusedUrls.includes(url) && ((baseline.checkpoint as any)?.verifiedMissing?.[catalogUrl(url)] || 0) >= 2;
    if (verified && unused) { resolved.push({ name: url, url, reason: "Referencia antigua sin uso en el catálogo ni en los artículos" }); continue; }
    if (verified && ([404, 410].includes(failure.status || 0) && matching.length && matching.every(row => row.linkStatus === "missing") || recovered)) {
      resolved.push({ name: matching[0]?.name || url, url, reason: recovered ? "Enlace recuperado" : "Retiro confirmado; las menciones quedan sin enlace" }); continue;
    }
    open.push({ id: `${baseline.id}:url:${url || open.length}`, runId: baseline.id, kind: "link", code: [404, 410].includes(failure.status || 0) ? "CATALOG_MISSING" : "CATALOG_FETCH_FAILED", name: matching[0]?.name || "Enlace de la tienda", url, message: matching.some(row => row.missingRuns === 1) ? "Enlace caído: falta una segunda confirmación en otro día." : failure.error, candidates: [] });
  }
  return { open, resolved };
}

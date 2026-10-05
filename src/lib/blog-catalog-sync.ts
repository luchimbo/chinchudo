import type { PrismaClient } from "@prisma/client";
import { catalogUrl, normalizeCatalogText, type StoreSnapshot, createStoreReader, parseStorePage, StoreHttpError } from "./tiendanube-public";
export const ACTIVE_SYNC_STATUSES = ["QUEUED", "RUNNING", "PENDING_DEPLOY", "DEPLOYING"];
export type SyncChange = { kind: "product" | "category"; ref: string; action: "create" | "update" | "missing" | "review" | "seen"; beforeUrl: string; afterUrl: string; name: string; incoming?: StoreSnapshot; candidates?: string[] };
type CatalogRow = { id: string; clientId: string; name: string; url: string; externalId?: string; key?: string; brand?: string; useText?: string; description?: string; categoryKey?: string; tiendanubeId?: string | null; sourceSnapshot?: unknown; linkStatus?: string; missingRuns?: number; lastMissingDate?: string };
export type CrawlCheckpoint = { urls: string[]; cursor: number; snapshots: StoreSnapshot[]; failures: Array<{ url: string; error: string; status?: number }>; discoveryComplete: boolean; verifiedMissing?: Record<string, number>; applied?: boolean };
export const argentinaDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export function matchCatalogRow(rows: CatalogRow[], snapshot: StoreSnapshot): { row?: CatalogRow; candidates: CatalogRow[] } {
  const sameId = rows.filter(r => r.tiendanubeId === snapshot.id);
  if (sameId.length === 1) return { row: sameId[0], candidates: [] };
  const sameUrl = rows.filter(r => [snapshot.url, ...(snapshot.requestedUrls || [])].some(u => catalogUrl(r.url) === catalogUrl(u)) && (!r.tiendanubeId || r.tiendanubeId === snapshot.id));
  if (sameUrl.length === 1) return { row: sameUrl[0], candidates: [] };
  const candidates = rows.filter(r => (!r.tiendanubeId || r.tiendanubeId === snapshot.id) && normalizeCatalogText(r.name) === normalizeCatalogText(snapshot.name) &&
    (!r.brand || snapshot.brand ? !r.brand || normalizeCatalogText(r.brand) === normalizeCatalogText(snapshot.brand) : normalizeCatalogText(snapshot.name).includes(normalizeCatalogText(r.brand))));
  if (candidates.length === 1 && !sameUrl.length) return { row: candidates[0], candidates: [] };
  const conflicting = rows.filter(r => normalizeCatalogText(r.name) === normalizeCatalogText(snapshot.name));
  return { candidates: sameUrl.length ? sameUrl : candidates.length ? candidates : conflicting };
}

export function importedFields(row: CatalogRow | undefined, s: StoreSnapshot) {
  const previous = (row?.sourceSnapshot || {}) as Partial<StoreSnapshot>;
  const owned = (field: "name" | "brand" | "description", value: string | undefined) => !value || value === previous[field];
  const fields: Record<string, unknown> = { tiendanubeId: s.id, url: s.url, sourceSnapshot: s, lastSeenAt: new Date(s.fetchedAt), missingRuns: 0, lastMissingDate: "", linkStatus: "active" };
  if (owned("name", row?.name)) fields.name = s.name;
  if (s.kind === "category" && owned("description", row?.description)) fields.description = s.description;
  if (s.kind === "product") {
    if (owned("brand", row?.brand)) fields.brand = s.brand;
    if (!row?.useText || row.useText === previous.description) fields.useText = s.description;
  }
  return fields;
}

export function planCatalogChanges(products: CatalogRow[], categories: CatalogRow[], checkpoint: CrawlCheckpoint): SyncChange[] {
  const changes: SyncChange[] = [];
  const seen = new Set<string>();
  const claimed = new Set<string>();
  for (const s of checkpoint.snapshots) {
    const identity = `${s.kind}:${s.id}`; if (seen.has(identity)) continue; seen.add(identity);
    const merged = { ...s, requestedUrls: checkpoint.snapshots.filter(other => other.kind === s.kind && other.id === s.id).flatMap(other => other.requestedUrls || []) };
    const { row, candidates } = matchCatalogRow(s.kind === "product" ? products : categories, merged);
    if (candidates.length || row && claimed.has(row.id)) { changes.push({ kind: s.kind, ref: identity, name: s.name, action: "review", beforeUrl: "", afterUrl: s.url, incoming: s, candidates: candidates.length ? candidates.map(r => r.id) : [row!.id] }); continue; }
    if (row) claimed.add(row.id);
    const snapshotSignature = (value: Partial<StoreSnapshot>) => JSON.stringify([value.kind,value.id,value.url,value.name,value.brand,value.description,value.sku,value.categories?.map(c=>[c.name,catalogUrl(c.url)]),value.price,value.currency,value.availability]);
    const descriptiveChanges = row && Object.entries(importedFields(row,s)).some(([field,value]) => ["name","brand","description","useText"].includes(field) && value !== (row as any)[field]);
    const unchanged = row && !descriptiveChanges && row.linkStatus !== "missing" && row.tiendanubeId === s.id && row.url === s.url && snapshotSignature((row.sourceSnapshot || {}) as Partial<StoreSnapshot>) === snapshotSignature(s);
    changes.push({ kind: s.kind, ref: row?.externalId || row?.key || `tn-${s.kind}-${s.id}`, name: row?.name || s.name, action: row ? unchanged ? "seen" : "update" : "create", beforeUrl: row?.url || "", afterUrl: s.url, incoming: s });
  }
  return changes;
}

export async function enqueueCatalogSync(prisma: PrismaClient, clientId: string) {
  const existing = await prisma.catalogSyncRun.findFirst({ where: { clientId, status: { in: ACTIVE_SYNC_STATUSES } }, orderBy: { startedAt: "desc" } });
  if (existing) return existing;
  try { return await prisma.catalogSyncRun.create({ data: { clientId } }); }
  catch (e) {
    const concurrent = await prisma.catalogSyncRun.findFirst({ where: { clientId, status: { in: ACTIVE_SYNC_STATUSES } } });
    if (concurrent) return concurrent; throw e;
  }
}

export async function crawlCatalog(reader: ReturnType<typeof createStoreReader>, oldUrls: string[], checkpoint: CrawlCheckpoint | undefined, save: (c: CrawlCheckpoint) => Promise<void>, assert = () => {}) {
  const state = checkpoint?.discoveryComplete ? checkpoint : { urls: [], cursor: 0, snapshots: [], failures: [], discoveryComplete: false } as CrawlCheckpoint;
  // Always reload robots after restarting; discovery is only repeated before its checkpoint.
  if (!state.discoveryComplete) {
    const discovered = await reader.discover();
    if (!discovered.length) throw new Error("El sitemap no contiene páginas; se conserva el catálogo anterior.");
    state.urls = [...new Set([...discovered, ...oldUrls.filter(Boolean)])]; state.discoveryComplete = true;
    assert(); await save(state);
  } else {
    try { reader.setRobots((await reader.read(new URL("/robots.txt", state.urls[0]).href)).text); } catch (e) { if (!(e instanceof StoreHttpError) || e.status !== 404) throw e; }
  }
  for (; state.cursor < state.urls.length; state.cursor++) {
    assert(); const url = state.urls[state.cursor];
    try {
      const result = await reader.read(url); const snapshot = parseStorePage(result.text,result.url);
      if (snapshot) {
        await reader.validate(snapshot.url);
        if(catalogUrl(snapshot.url)!==catalogUrl(result.url)){
          const canonical=await reader.read(snapshot.url);
          const verified=parseStorePage(canonical.text,canonical.url);
          if(!verified||verified.id!==snapshot.id||verified.kind!==snapshot.kind||catalogUrl(verified.url)!==catalogUrl(snapshot.url))throw new Error("La URL canónica no corresponde a la ficha principal.");
        }
        snapshot.requestedUrls = [url]; state.snapshots.push(snapshot);
      }
      else if (/\/productos\/.+/.test(new URL(url).pathname)) state.failures.push({ url, error: "La ficha no expone una identidad de producto verificable." });
    } catch (e) { state.failures.push({ url, error: e instanceof Error ? e.message : String(e), ...(e instanceof StoreHttpError ? { status: e.status } : {}) }); }
    if ((state.cursor + 1) % 10 === 0) { assert(); await save({ ...state, cursor: state.cursor + 1 }); }
  }
  assert(); await save(state);
  return state;
}

export async function applyCatalogSync(prisma: PrismaClient, runId: string, clientId: string, checkpoint: CrawlCheckpoint, assert = () => {}) {
  const [products, categories] = await Promise.all([prisma.landingProduct.findMany({ where: { clientId } }), prisma.landingCategory.findMany({ where: { clientId } })]);
  const changes = planCatalogChanges(products, categories, checkpoint);
  const day = argentinaDay();
  const complete = !checkpoint.failures.some(f => f.status !== 404 && f.status !== 410);
  assert();
  return prisma.$transaction(async tx => {
    const run = await tx.catalogSyncRun.findFirstOrThrow({ where: { id: runId, clientId } });
    if ((run.checkpoint as any)?.applied) return run.changes as unknown as SyncChange[];
    const categoryKeyByUrl = new Map(categories.map(c => [catalogUrl(c.url), c.key]));
    for(const c of changes.filter(c=>c.kind==="category"&&c.action!=="review"))categoryKeyByUrl.set(catalogUrl(c.afterUrl),c.ref);
    const newProducts: any[] = [], newCategories: any[] = [];
    const updateProducts:Array<{id:string;fields:Record<string,unknown>}>=[],updateCategories:Array<{id:string;fields:Record<string,unknown>}>=[];
    for (const change of [...changes.filter(c => c.kind === "category"), ...changes.filter(c => c.kind === "product")]) {
      if (change.action === "review") continue;
      const s = change.incoming!;
      const existing: CatalogRow | undefined = (s.kind === "product" ? products : categories).find(r => ("externalId" in r ? r.externalId : r.key) === change.ref);
      if(change.action==="seen" && existing){(s.kind==="product"?updateProducts:updateCategories).push({id:existing.id,fields:{sourceSnapshot:{...(existing.sourceSnapshot as object),...s},lastSeenAt:s.fetchedAt,missingRuns:0,lastMissingDate:"",linkStatus:"active"}});continue;}
      const fields = importedFields(existing,s);
      if (s.kind === "category") {
        if(existing)updateCategories.push({id:existing.id,fields});
        else newCategories.push({clientId,key:change.ref,name:s.name,...fields});
        categoryKeyByUrl.set(catalogUrl(s.url),change.ref);
      } else {
        const categoryKey = [...s.categories].reverse().map(c => categoryKeyByUrl.get(catalogUrl(c.url))).find(Boolean) || "";
        if (!existing?.categoryKey || existing.categoryKey === (existing.sourceSnapshot as any)?.categoryKey) fields.categoryKey = categoryKey;
        const softwareCategory = s.categories.some(c => /software|cubase|nuendo|pro-tools|vst|plugins?/i.test(`${c.name} ${new URL(c.url).pathname}`));
        const effectiveCategory = typeof fields.categoryKey === "string" ? fields.categoryKey : existing?.categoryKey || categoryKey;
        fields.sourceSnapshot = { ...s, categoryKey, editorialEligible: !softwareCategory && Boolean(effectiveCategory) };
        if(existing)updateProducts.push({id:existing.id,fields});
        else newProducts.push({clientId,externalId:change.ref,name:s.name,...fields});
      }
    }
    if(newCategories.length)await tx.landingCategory.createMany({data:newCategories});
    if(newProducts.length)await tx.landingProduct.createMany({data:newProducts});
    // Absence alone is insufficient: the old URL must also have returned 404/410.
    if (complete) for (const row of [...products.map(p => ({ ...p, kind: "product" as const, ref: p.externalId })), ...categories.map(c => ({ ...c, kind: "category" as const, ref: c.key }))]) {
      if (!row.tiendanubeId || checkpoint.snapshots.some(s => s.kind === row.kind && s.id === row.tiendanubeId) || row.lastMissingDate === day) continue;
      const failure = checkpoint.failures.find(f => catalogUrl(f.url) === catalogUrl(row.url) && [404,410].includes(f.status || 0));
      if (!failure) continue;
      const missingRuns = row.missingRuns + 1, status = missingRuns >= 2 ? "missing" : "active";
      const data = { missingRuns, lastMissingDate: day, linkStatus: status };
      (row.kind === "product" ? updateProducts : updateCategories).push({id:row.id,fields:data});
      changes.push({ kind: row.kind, ref: row.ref, action: missingRuns >= 2 ? "missing" : "review", beforeUrl: row.url, afterUrl: missingRuns >= 2 ? "" : row.url, name: row.name });
    }
    // A bounded statement per table keeps the transaction short even if every price changes.
    if(updateCategories.length)await tx.$executeRaw`
      UPDATE "LandingCategory" AS c SET
        "tiendanubeId"=COALESCE(v.fields->>'tiendanubeId',c."tiendanubeId"),
        url=COALESCE(v.fields->>'url',c.url),name=COALESCE(v.fields->>'name',c.name),
        description=COALESCE(v.fields->>'description',c.description),
        "sourceSnapshot"=COALESCE(v.fields->'sourceSnapshot',c."sourceSnapshot"),
        "lastSeenAt"=COALESCE((v.fields->>'lastSeenAt')::timestamptz,c."lastSeenAt"),
        "missingRuns"=COALESCE((v.fields->>'missingRuns')::integer,c."missingRuns"),
        "lastMissingDate"=COALESCE(v.fields->>'lastMissingDate',c."lastMissingDate"),
        "linkStatus"=COALESCE(v.fields->>'linkStatus',c."linkStatus"),"updatedAt"=now()
      FROM jsonb_to_recordset(${JSON.stringify(updateCategories)}::jsonb) AS v(id text,fields jsonb)
      WHERE c.id=v.id AND c."clientId"=${clientId}`;
    if(updateProducts.length)await tx.$executeRaw`
      UPDATE "LandingProduct" AS p SET
        "tiendanubeId"=COALESCE(v.fields->>'tiendanubeId',p."tiendanubeId"),
        url=COALESCE(v.fields->>'url',p.url),name=COALESCE(v.fields->>'name',p.name),
        brand=COALESCE(v.fields->>'brand',p.brand),"useText"=COALESCE(v.fields->>'useText',p."useText"),
        "categoryKey"=COALESCE(v.fields->>'categoryKey',p."categoryKey"),
        "sourceSnapshot"=COALESCE(v.fields->'sourceSnapshot',p."sourceSnapshot"),
        "lastSeenAt"=COALESCE((v.fields->>'lastSeenAt')::timestamptz,p."lastSeenAt"),
        "missingRuns"=COALESCE((v.fields->>'missingRuns')::integer,p."missingRuns"),
        "lastMissingDate"=COALESCE(v.fields->>'lastMissingDate',p."lastMissingDate"),
        "linkStatus"=COALESCE(v.fields->>'linkStatus',p."linkStatus"),"updatedAt"=now()
      FROM jsonb_to_recordset(${JSON.stringify(updateProducts)}::jsonb) AS v(id text,fields jsonb)
      WHERE p.id=v.id AND p."clientId"=${clientId}`;
    await tx.catalogSyncRun.update({ where: { id: runId }, data: { status: "PENDING_DEPLOY", checkpoint: { ...checkpoint, applied: true } as any, changes: changes as any, errors: checkpoint.failures as any } });
    return changes;
  }, { timeout: 60_000 });
}

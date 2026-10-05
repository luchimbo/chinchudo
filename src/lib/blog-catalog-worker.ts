import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { createStoreReader } from "./tiendanube-public";
import { ACTIVE_SYNC_STATUSES, applyCatalogSync, argentinaDay, crawlCatalog, enqueueCatalogSync, planCatalogChanges, type CrawlCheckpoint } from "./blog-catalog-sync";
import { withBlogLease, type BlogLease } from "../../scripts/blog-lease.mjs";

const root = process.cwd(), site = join(root,"landing-build","site");
async function htmlFiles(directory = site, prefix = ""): Promise<Record<string,string>> {
  const entries = await readdir(directory,{ withFileTypes: true }).catch(() => []);
  const output: Record<string,string> = {};
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory,entry.name), key = `${prefix}${entry.name}`;
    if (entry.isDirectory()) Object.assign(output,await htmlFiles(path,`${key}/`));
    else if (entry.name.endsWith(".html")) output[key] = await readFile(path,"utf8");
  }
  return output;
}
export const catalogHtmlHash = (html: string) => createHash("sha256").update(html.replace(/<meta name="catalog-sync-version" content="[^"]*">/g, "")).digest("hex");
export const catalogHtmlLinks = (html: string, storeUrl: string) => {
  const $ = cheerio.load(html), host = new URL(storeUrl).hostname.replace(/^www\./, "");
  return [...new Set($("a[href]").toArray().flatMap(node => {
    try { const url = new URL($(node).attr("href")!); return url.hostname.replace(/^www\./, "") === host ? [url.href] : []; } catch { return []; }
  }))].sort();
};

async function python(args: string[], lease: BlogLease, version: string) {
  lease.assert();
  const command = process.env.PYTHON_COMMAND || "python";
  return new Promise<void>((resolve,reject) => {
    const child = spawn(command,[join(root,"landing-build","build_landings.py"),"--client-slug","pcmidi",...args], {
      cwd: root, windowsHide: true, env: { ...process.env, LANDING_EXPECTED_CLIENT_ID: lease.clientId, LANDING_CATALOG_VERSION: version, PYTHONIOENCODING: "utf-8" },
    });
    let tail = "";
    const collect = (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-2500); };
    child.stdout.on("data",collect); child.stderr.on("data",collect);
    const stop = async () => { const { terminateChild } = await import("../../scripts/terminate-child.mjs"); terminateChild(child); };
    const timeout = setTimeout(() => { void stop(); },30*60_000);
    lease.signal.addEventListener("abort",stop,{ once: true });
    child.on("error",e => { clearTimeout(timeout); lease.signal.removeEventListener("abort",stop); reject(e); });
    child.on("close",code => { clearTimeout(timeout); lease.signal.removeEventListener("abort",stop); try { lease.assert(); if (code !== 0) throw new Error(`Falló el proceso del blog (${code}): ${tail}`); resolve(); } catch(e) { reject(e); } });
  });
}

export async function deployCatalogRun(prisma: PrismaClient, runId: string, lease: BlogLease) {
  const row = await prisma.catalogSyncRun.findFirstOrThrow({ where: { id:runId,clientId:lease.clientId } });
  if(row.deploymentAttempts>=3)return;
  lease.assert();
  await prisma.catalogSyncRun.update({where:{id:runId},data:{status:"DEPLOYING",deploymentAttempts:{increment:1}}});
  try { await deployCatalogArtifact(prisma,runId,lease); }
  catch(error) {
    const current=await prisma.catalogSyncRun.findFirstOrThrow({where:{id:runId,clientId:lease.clientId}});
    if(!lease.signal.aborted)await prisma.catalogSyncRun.update({where:{id:runId},data:{status:"PENDING_DEPLOY",deployment:{...(current.deployment as any),verified:false,error:error instanceof Error?error.message:String(error)}}});
    throw error;
  }
}

async function deployCatalogArtifact(prisma: PrismaClient, runId: string, lease: BlogLease) {
  const run = await prisma.catalogSyncRun.findFirstOrThrow({ where: { id: runId, clientId: lease.clientId } });
  const client = await prisma.client.findUniqueOrThrow({ where: { id: lease.clientId } });
  if (!client.blogBaseUrl) throw new Error("Configurá la URL pública del blog y reintentá el despliegue.");
  const previousVersion = (await prisma.appSetting.findUnique({ where: { key: `blog_catalog_version:${client.id}` } }))?.value || "";
  const previous = await prisma.catalogSyncRun.findFirst({ where: { clientId: client.id, status: { in: ["COMPLETED","PARTIAL"] }, id: { not: run.id } }, orderBy: { startedAt: "desc" } });
  const baseline = (previous?.deployment as any)?.manifest as Record<string,string> | undefined;
  await python(["build","--base-url",client.blogBaseUrl],lease,previousVersion);
  const files = await htmlFiles();
  const manifest = Object.fromEntries(Object.entries(files).map(([path,html]) => [path,catalogHtmlHash(html)]));
  const changed = Object.keys(manifest).filter(path => manifest[path] !== baseline?.[path]);
  if (baseline) changed.push(...Object.keys(baseline).filter(path => !manifest[path]));
  const errors = run.errors as any[];
  const finalStatus = errors.length || (run.changes as any[]).some(c => c.action === "review") ? "PARTIAL" : "COMPLETED";
  if (!changed.length) {
    await prisma.catalogSyncRun.update({ where: { id: run.id }, data: { status: finalStatus, finishedAt: new Date(), deployment: { verified: true, skipped: true, manifest, version: previousVersion } } });
    return;
  }
  lease.assert();
  await prisma.catalogSyncRun.update({ where: { id: run.id }, data: { status: "DEPLOYING", deployment: { manifest, changed, version: run.id, verified: false } } });
  try {
    // Add only the version marker to the validated artifact; never load pending revisions.
    for (const [path,html] of Object.entries(files)) await writeFile(join(site,path),html.replace(/<meta name="catalog-sync-version" content="[^"]*">/g, "").replace("</head>",`<meta name="catalog-sync-version" content="${run.id}"></head>`),"utf8");
    await python(["catalog-deploy","--base-url",client.blogBaseUrl],lease,run.id);
    for (const path of changed) {
      lease.assert();
      const url = new URL(path.replace(/index\.html$/, ""),client.blogBaseUrl.replace(/\/?$/, "/"));
      url.searchParams.set("catalog_revision",run.id);
      const response = await fetch(url,{ signal: AbortSignal.any([lease.signal,AbortSignal.timeout(20_000)]), headers: { "Cache-Control": "no-cache" } });
      if (!files[path]) { if (response.status !== 404 && response.status !== 410) throw new Error(`La página retirada sigue online: ${path}`); continue; }
      if (!response.ok) throw new Error(`El blog respondió ${response.status}: ${path}`);
      const html = await response.text();
      if (!html.includes(`<meta name="catalog-sync-version" content="${run.id}">`)) throw new Error(`No se confirmó la versión desplegada: ${path}`);
      if (JSON.stringify(catalogHtmlLinks(html,client.storeUrl)) !== JSON.stringify(catalogHtmlLinks(files[path],client.storeUrl))) throw new Error(`Los enlaces online difieren del artefacto validado: ${path}`);
    }
    lease.assert();
    await prisma.$transaction([
      prisma.appSetting.upsert({ where: { key: `blog_catalog_version:${client.id}` }, create: { key: `blog_catalog_version:${client.id}`, value: run.id }, update: { value: run.id } }),
      prisma.catalogSyncRun.update({ where: { id: run.id }, data: { status: finalStatus, finishedAt: new Date(), deployment: { verified: true, manifest, changed, version: run.id, verifiedAt: new Date().toISOString() } } }),
    ]);
  } catch (error) {
    if(!lease.signal.aborted)await prisma.catalogSyncRun.update({ where: { id: run.id }, data: { status: "PENDING_DEPLOY", deployment: { manifest, changed, version: run.id, verified: false, error: error instanceof Error ? error.message : String(error) } } });
    throw error;
  }
}

export async function runCatalogWorker(prisma: PrismaClient, clientSlug = "pcmidi", options: { dryRun?: boolean; force?: boolean; scheduled?: boolean } = {}) {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: clientSlug } });
  if (client.slug !== "pcmidi") throw new Error("Esta sincronización está habilitada para PC MIDI.");
  if (!client.active || !client.storeUrl) throw new Error("El cliente no está activo o falta la URL de la tienda.");
  const report = async (data: unknown) => { await mkdir(join(root,"reports"),{ recursive:true }); const path = join(root,"reports",`catalog-sync-${Date.now()}.json`); await writeFile(path,JSON.stringify(data,null,2),"utf8"); return path; };
  if (options.dryRun) {
    // Explicit old-column selections also allow the simulation before the additive migration.
    const [products,categories] = await Promise.all([
      prisma.landingProduct.findMany({ where: { clientId: client.id }, select: { id:true,clientId:true,externalId:true,name:true,brand:true,url:true,useText:true,categoryKey:true } }),
      prisma.landingCategory.findMany({ where: { clientId: client.id }, select: { id:true,clientId:true,key:true,name:true,url:true,description:true } }),
    ]);
    const state = await crawlCatalog(createStoreReader(client.storeUrl),[...products,...categories].map(r => r.url),undefined,async () => {});
    const changes = planCatalogChanges(products,categories,state);
    const path = await report({ command:"blog:sync-catalog",date:new Date().toISOString(),channel:"tiendanube-public",client:client.slug,dryRun:true,read:state.cursor,created:changes.filter(c=>c.action==="create").length,discarded:changes.filter(c=>c.action==="review").length,products:state.snapshots.filter(s=>s.kind==="product").length,categories:state.snapshots.filter(s=>s.kind==="category").length,changes,errors:state.failures });
    return { dryRun:true,report:path,read:state.cursor,errors:state.failures.length };
  }
  return withBlogLease(prisma,client.id,async lease => {
    let run = await prisma.catalogSyncRun.findFirst({ where: { clientId:client.id,status:{in:ACTIVE_SYNC_STATUSES} },orderBy:{startedAt:"desc"} });
    if (!run) {
      const setting = await prisma.appSetting.findUnique({ where:{key:`blog_catalog_sync:${client.id}`} });
      let config: any = {}; try { config=JSON.parse(setting?.value||"{}"); } catch { /* disabled */ }
      if (options.scheduled) {
        if (!config.enabled) return { skipped:true };
        const last = await prisma.catalogSyncRun.findFirst({ where:{clientId:client.id},orderBy:{startedAt:"desc"} });
        const hour = Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
        if (last && (argentinaDay(last.startedAt) === argentinaDay() || hour < 6)) return { skipped:true };
      }
      if (!options.force && !options.scheduled) return { skipped:true };
      run = await enqueueCatalogSync(prisma,client.id);
    }
    if (run.deploymentAttempts>=3 && ["PENDING_DEPLOY","DEPLOYING"].includes(run.status)) return { runId:run.id,pending:true };
    try {
      if (["QUEUED","RUNNING"].includes(run.status)) {
        lease.assert(); await prisma.catalogSyncRun.update({where:{id:run.id},data:{status:"RUNNING"}});
        const [products,categories]=await Promise.all([prisma.landingProduct.findMany({where:{clientId:client.id}}),prisma.landingCategory.findMany({where:{clientId:client.id}})]);
        const raw=run.checkpoint as any;
        const state=await crawlCatalog(createStoreReader(client.storeUrl,{signal:lease.signal}),[...products,...categories].map(r=>r.url),raw.discoveryComplete ? raw : undefined,async checkpoint=>{
          lease.assert(); await prisma.catalogSyncRun.update({where:{id:run!.id},data:{checkpoint:checkpoint as any}});
        },()=>lease.assert());
        await applyCatalogSync(prisma,run.id,client.id,state,()=>lease.assert());
      }
      await deployCatalogRun(prisma,run.id,lease);
      const result=await prisma.catalogSyncRun.findUniqueOrThrow({where:{id:run.id}});
      const checkpoint=result.checkpoint as any,changes=result.changes as any[];
      const path=await report({command:"blog:sync-catalog",date:new Date().toISOString(),channel:"tiendanube-public",client:client.slug,read:checkpoint.cursor||0,created:changes.filter(c=>c.action==="create").length,discarded:changes.filter(c=>c.action==="review").length,...result});
      return {runId:run.id,status:result.status,report:path};
    } catch (error) {
      if(lease.signal.aborted)throw error;
      const current=await prisma.catalogSyncRun.findUniqueOrThrow({where:{id:run.id}});
      if (["QUEUED","RUNNING"].includes(current.status)) await prisma.catalogSyncRun.update({where:{id:run.id},data:{status:"FAILED",finishedAt:new Date(),errors:[{error:error instanceof Error?error.message:String(error)}]}});
      await report({command:"blog:sync-catalog",date:new Date().toISOString(),channel:"tiendanube-public",client:client.slug,runId:run.id,read:(current.checkpoint as any)?.cursor||0,created:0,discarded:0,errors:[{error:error instanceof Error?error.message:String(error)}]});
      throw error;
    }
  });
}

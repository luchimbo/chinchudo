import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnedClientId, toErrorResponse } from "@/lib/auth-guards";
import { ACTIVE_SYNC_STATUSES, enqueueCatalogSync, importedFields, type SyncChange } from "@/lib/blog-catalog-sync";
import { withBlogLease } from "../../../../../../scripts/blog-lease.mjs";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const client = await requireOwnedClientId(new URL(request.url).searchParams.get("clientId"));
    const [setting,runs,products,categories] = await Promise.all([
      prisma.appSetting.findUnique({where:{key:`blog_catalog_sync:${client.id}`}}),
      prisma.catalogSyncRun.findMany({where:{clientId:client.id},orderBy:{startedAt:"desc"},take:10}),
      prisma.landingProduct.findMany({where:{clientId:client.id},select:{id:true,name:true,externalId:true,linkStatus:true}}),
      prisma.landingCategory.findMany({where:{clientId:client.id},select:{id:true,name:true,key:true,linkStatus:true}}),
    ]);
    let config={enabled:false}; try {config=JSON.parse(setting?.value||"{}");}catch{/* disabled */}
    return NextResponse.json({config,runs:runs.map(run=>{
      const checkpoint=run.checkpoint as any;
      const deployment=run.deployment as any;
      const changes=(run.changes as unknown as SyncChange[]).filter(c=>c.action!=="seen").map(c=>({kind:c.kind,ref:c.ref,action:c.action,name:c.name,beforeUrl:c.beforeUrl,afterUrl:c.afterUrl,candidates:c.candidates,...(c.action==="review"&&c.incoming?{incoming:true}:{})}));
      return {id:run.id,status:run.status,startedAt:run.startedAt,finishedAt:run.finishedAt,progress:{read:checkpoint.cursor||0,total:checkpoint.urls?.length||0},changes,errors:run.errors,deployment:{verified:deployment.verified,skipped:deployment.skipped,error:deployment.error,version:deployment.version,verifiedAt:deployment.verifiedAt},deploymentAttempts:run.deploymentAttempts};
    }),products,categories});
  }catch(error){return toErrorResponse(error);}
}
const bodySchema=z.object({clientId:z.string().min(1),action:z.enum(["sync","configure","retry","resolve"]).default("sync"),enabled:z.boolean().optional(),runId:z.string().optional(),ref:z.string().optional(),targetId:z.string().optional()});
export async function POST(request: Request) {
  try {
    const parsed=bodySchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"La solicitud de sincronización no es válida."},{status:400});
    const body=parsed.data,client=await requireOwnedClientId(body.clientId);
    if(client.slug!=="pcmidi")return NextResponse.json({error:"La sincronización está habilitada para PC MIDI."},{status:400});
    if(body.action==="configure"){
      if(body.enabled && (!client.storeUrl.startsWith("https://")||!client.blogBaseUrl))return NextResponse.json({error:"Configurá las URLs de la tienda y del blog antes de activarla."},{status:400});
      const value=JSON.stringify({enabled:body.enabled===true,publishTime:"06:00",timezone:"America/Argentina/Buenos_Aires"});
      await prisma.appSetting.upsert({where:{key:`blog_catalog_sync:${client.id}`},create:{key:`blog_catalog_sync:${client.id}`,value},update:{value}});
      return NextResponse.json({ok:true});
    }
    if(body.action==="sync")return NextResponse.json({run:await enqueueCatalogSync(prisma,client.id)},{status:202});
    const run=await prisma.catalogSyncRun.findFirst({where:{id:body.runId||"",clientId:client.id}});
    if(!run)return NextResponse.json({error:"No se encontró la sincronización de este cliente."},{status:404});
    if(body.action==="retry"){
      if(!["PENDING_DEPLOY","FAILED"].includes(run.status))return NextResponse.json({error:"La sincronización no requiere un reintento."},{status:409});
      const result=await withBlogLease(prisma,client.id,async()=>prisma.catalogSyncRun.update({where:{id:run.id},data:{status:run.status==="FAILED"?"QUEUED":"PENDING_DEPLOY",deploymentAttempts:0,finishedAt:null}}));
      if(!result)return NextResponse.json({error:"El blog está trabajando. Reintentá cuando termine."},{status:409});
      return NextResponse.json({run:result},{status:202});
    }
    const change=(run.changes as unknown as SyncChange[]).find(c=>c.ref===body.ref&&c.action==="review"&&c.incoming);
    if(!change?.incoming||!body.targetId||!change.candidates?.includes(body.targetId))return NextResponse.json({error:"Elegí uno de los registros candidatos de este cliente."},{status:400});
    const result=await withBlogLease(prisma,client.id,async lease=>{
      const active=await prisma.catalogSyncRun.findFirst({where:{clientId:client.id,status:{in:ACTIVE_SYNC_STATUSES}}});
      if(active)throw new Error("Esperá a que termine la sincronización activa antes de vincular productos.");
      const target=change.kind==="product"?await prisma.landingProduct.findFirst({where:{id:body.targetId,clientId:client.id}}):await prisma.landingCategory.findFirst({where:{id:body.targetId,clientId:client.id}});
      if(!target)throw new Error("El registro no pertenece a este cliente.");
      lease.assert();
      return prisma.$transaction(async tx=>{
        const fields=importedFields(target,change.incoming!);
        if(change.kind==="product")await tx.landingProduct.update({where:{id:target.id},data:fields});
        else await tx.landingCategory.update({where:{id:target.id},data:fields});
        const ref="externalId"in target?target.externalId:target.key;
        return tx.catalogSyncRun.create({data:{clientId:client.id,status:"PENDING_DEPLOY",checkpoint:{applied:true,resolvedFrom:run.id},changes:[{...change,ref,action:"update",beforeUrl:target.url,afterUrl:change.incoming!.url,resolvedFrom:run.id}] as any}});
      });
    });
    if(!result)return NextResponse.json({error:"El blog está trabajando. Reintentá cuando termine."},{status:409});
    return NextResponse.json({run:result},{status:202});
  }catch(error){return toErrorResponse(error);}
}

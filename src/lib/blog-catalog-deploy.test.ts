import { EventEmitter } from "node:events";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({code:0,html:'<head></head><a href="https://shop.example/new/">Producto</a>',spawn:vi.fn(),write:vi.fn()}));
vi.mock("node:child_process",()=>({spawn:mocks.spawn}));
vi.mock("node:fs/promises",()=>({readdir:async()=>[{name:"index.html",isDirectory:()=>false}],readFile:async()=>mocks.html,writeFile:mocks.write,mkdir:async()=>{}}));
import { deployCatalogRun,catalogHtmlHash } from "./blog-catalog-worker";
function database(previous?:any){
  const run:any={id:"run",clientId:"a",status:"PENDING_DEPLOY",deploymentAttempts:0,deployment:{},changes:[],errors:[]};
  const prisma:any={client:{findUniqueOrThrow:async()=>({id:"a",storeUrl:"https://shop.example",blogBaseUrl:"https://blog.example"})},catalogSyncRun:{findFirstOrThrow:async()=>structuredClone(run),findFirst:async()=>previous?{deployment:previous}:null,update:vi.fn(async({data}:any)=>{for(const[key,value]of Object.entries(data))run[key]=key==="deploymentAttempts"?run[key]+(value as any).increment:value;return run;})},appSetting:{findUnique:async()=>null,upsert:vi.fn(async()=>({}))},$transaction:async(values:any[])=>Promise.all(values)};
  return {run,prisma};
}
const lease=()=>({clientId:"a",signal:new AbortController().signal,assert:()=>{}});
beforeEach(()=>{
  vi.clearAllMocks();mocks.code=0;
  mocks.spawn.mockImplementation(()=>{const child:any=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();setTimeout(()=>child.emit("close",mocks.code),0);return child;});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(`<head><meta name="catalog-sync-version" content="run"></head><a href="https://shop.example/new/">Producto</a>`)));
});
afterEach(()=>vi.unstubAllGlobals());
describe("despliegue del catálogo",()=>{
  it("limita también los fallos de construcción a tres intentos",async()=>{
    const{prisma,run}=database();mocks.code=1;
    for(let i=0;i<3;i++)await expect(deployCatalogRun(prisma,"run",lease())).rejects.toThrow("Falló el proceso");
    await deployCatalogRun(prisma,"run",lease());expect(run).toMatchObject({status:"PENDING_DEPLOY",deploymentAttempts:3});expect(mocks.spawn).toHaveBeenCalledTimes(3);
  });
  it("omite el despliegue si el HTML es idéntico",async()=>{
    const{prisma,run}=database({manifest:{"index.html":catalogHtmlHash(mocks.html)}});await deployCatalogRun(prisma,"run",lease());expect(run).toMatchObject({status:"COMPLETED",deployment:{skipped:true,verified:true}});expect(mocks.spawn).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
  });
  it("no registra éxito sin confirmar la marca de versión online",async()=>{
    const{prisma,run}=database();vi.mocked(fetch).mockResolvedValue(new Response(mocks.html));await expect(deployCatalogRun(prisma,"run",lease())).rejects.toThrow("versión desplegada");expect(run.status).toBe("PENDING_DEPLOY");expect(run.deployment.verified).toBe(false);expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });
  it("rechaza una página online que conserva un enlace anterior",async()=>{
    const{prisma,run}=database();vi.mocked(fetch).mockResolvedValue(new Response('<meta name="catalog-sync-version" content="run"><a href="https://shop.example/old/">Producto</a>'));await expect(deployCatalogRun(prisma,"run",lease())).rejects.toThrow("enlaces online");expect(run.status).toBe("PENDING_DEPLOY");
  });
  it("confirma una actualización y conserva sus alertas de lectura",async()=>{
    const{prisma,run}=database();run.errors=[{error:"Ficha sin identidad"}];await deployCatalogRun(prisma,"run",lease());expect(run).toMatchObject({status:"PARTIAL",deployment:{verified:true,changed:["index.html"],version:"run"}});expect(prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{key:"blog_catalog_version:a"}}));
  });
});

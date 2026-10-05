import { describe,it,expect,vi,beforeEach } from "vitest";
import { NextResponse } from "next/server";
const mocks=vi.hoisted(()=>({owned:vi.fn(),enqueue:vi.fn(),prisma:{catalogSyncRun:{findFirst:vi.fn(),findMany:vi.fn()},appSetting:{findUnique:vi.fn(),upsert:vi.fn()},landingProduct:{findMany:vi.fn()},landingCategory:{findMany:vi.fn()}}}));
vi.mock("@/lib/db",()=>({prisma:mocks.prisma}));
vi.mock("@/lib/auth-guards",()=>({requireOwnedClientId:mocks.owned,toErrorResponse:(e:Error)=>NextResponse.json({error:e.message},{status:403})}));
vi.mock("@/lib/blog-catalog-sync",async()=>({...await vi.importActual<any>("@/lib/blog-catalog-sync"),enqueueCatalogSync:mocks.enqueue}));
import { GET,POST } from "@/app/api/blog/catalog/sync/route";
beforeEach(()=>vi.resetAllMocks());
describe("API de sincronización del catálogo",()=>{
  it("rechaza otro cliente antes de leer datos",async()=>{mocks.owned.mockRejectedValue(new Error("Sin acceso"));expect((await GET(new Request("https://app.example/api/blog/catalog/sync?clientId=other"))).status).toBe(403);expect(mocks.prisma.catalogSyncRun.findMany).not.toHaveBeenCalled();});
  it("encola solamente el cliente autorizado y devuelve el trabajo activo",async()=>{mocks.owned.mockResolvedValue({id:"a",slug:"pcmidi"});mocks.enqueue.mockResolvedValue({id:"existing",status:"RUNNING"});const r=await POST(new Request("https://app.example/api/blog/catalog/sync",{method:"POST",body:JSON.stringify({clientId:"a"})}));expect(r.status).toBe(202);expect(mocks.enqueue).toHaveBeenCalledWith(mocks.prisma,"a");expect(await r.json()).toMatchObject({run:{id:"existing"}});});
  it("no activa el circuito sin URLs configuradas",async()=>{mocks.owned.mockResolvedValue({id:"a",slug:"pcmidi",storeUrl:"",blogBaseUrl:""});const r=await POST(new Request("https://app.example/api/blog/catalog/sync",{method:"POST",body:JSON.stringify({clientId:"a",action:"configure",enabled:true})}));expect(r.status).toBe(400);expect(mocks.prisma.appSetting.upsert).not.toHaveBeenCalled();});
  it("no permite vincular una corrida ajena",async()=>{mocks.owned.mockResolvedValue({id:"a",slug:"pcmidi"});mocks.prisma.catalogSyncRun.findFirst.mockResolvedValue(null);const r=await POST(new Request("https://app.example/api/blog/catalog/sync",{method:"POST",body:JSON.stringify({clientId:"a",action:"resolve",runId:"other",targetId:"other-row",ref:"product:1"})}));expect(r.status).toBe(404);expect(mocks.prisma.catalogSyncRun.findFirst).toHaveBeenCalledWith({where:{id:"other",clientId:"a"}});});
});

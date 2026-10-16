import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({slot:vi.fn(),active:vi.fn(),updateSlot:vi.fn(),archive:vi.fn(),queue:vi.fn(),lock:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/db",()=>{const tx={blogPublication:{findUnique:mocks.slot,updateMany:mocks.updateSlot},landing:{update:mocks.archive},businessAnalysisRun:{findFirst:mocks.active,updateMany:mocks.queue},$queryRaw:mocks.lock};return{prisma:{...tx,$transaction:async(fn:any)=>fn(tx)}};});
vi.mock("@/lib/auth",()=>({assertClientAccess:vi.fn(async()=>{})}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import {retryBlogPreparation,restoreBlogDate,replaceBlogArticle,skipBlogDate,requestBlogPreparation} from "@/app/(app)/(creador)/blog/calendario/actions";
const slot={id:"slot",clientId:"c",status:"FAILED",landingId:null as string|null,analysisRunId:"analysis",requiresApproval:true,updatedAt:new Date("2026-10-14T14:00:00Z"),scheduledDate:new Date("2026-10-31"),client:{slug:"pcmidi",responsePolicy:{}}};
const data=()=>{const f=new FormData();f.set("id","slot");return f;};
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));mocks.slot.mockResolvedValue({...slot});mocks.active.mockResolvedValue(null);mocks.updateSlot.mockResolvedValue({count:1});mocks.queue.mockResolvedValue({count:1});});
afterEach(()=>vi.useRealTimers());
describe("acciones de generación bajo concurrencia",()=>{
  it("el panel recibe un motivo seguro sin depender de excepciones serializadas en producción",async()=>{
    mocks.active.mockResolvedValue({id:"other"});expect(await requestBlogPreparation("retry","slot")).toEqual({ok:false,error:"Esperá a que termine el análisis activo y reintentá."});expect(mocks.updateSlot).not.toHaveBeenCalled();
  });
  it.each(["analysis","other-analysis"])("un análisis activo %s no deja una fecha parcialmente reactivada",async id=>{
    mocks.active.mockResolvedValue({id});await expect(retryBlogPreparation(data())).rejects.toThrow("análisis activo");expect(mocks.updateSlot).not.toHaveBeenCalled();expect(mocks.queue).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("la restauración comprueba la cola antes de cambiar un día omitido",async()=>{
    mocks.slot.mockResolvedValue({...slot,status:"SKIPPED"});mocks.active.mockResolvedValue({id:"other"});await expect(restoreBlogDate(data())).rejects.toThrow("análisis activo");expect(mocks.updateSlot).not.toHaveBeenCalled();
  });
  it("reemplazar durante otro análisis no archiva el artículo actual",async()=>{
    mocks.slot.mockResolvedValue({...slot,status:"READY",landingId:"draft"});mocks.active.mockResolvedValue({id:"other"});await expect(replaceBlogArticle(data())).rejects.toThrow("análisis activo");expect(mocks.archive).not.toHaveBeenCalled();expect(mocks.updateSlot).not.toHaveBeenCalled();
  });
  it("un reintento aceptado conserva la aprobación y la versión esperada",async()=>{
    await retryBlogPreparation(data());expect(mocks.queue).toHaveBeenCalled();expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"slot",status:"FAILED",updatedAt:slot.updatedAt}),data:expect.objectContaining({status:"PLANNED",requiresApproval:true,approvedAt:null,preparation:{phase:"WAITING"}})}));
  });
  it("una publicación que cambió de estado no se omite ni archiva",async()=>{
    mocks.slot.mockResolvedValue({...slot,status:"READY",landingId:"draft",analysisRunId:null});mocks.updateSlot.mockResolvedValue({count:0});await expect(skipBlogDate(data())).rejects.toThrow("fecha cambió");expect(mocks.archive).not.toHaveBeenCalled();
  });
});

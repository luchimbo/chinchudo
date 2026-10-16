import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks=vi.hoisted(()=>({lease:vi.fn()}));
vi.mock("../../scripts/blog-lease.mjs",()=>({withBlogLease:mocks.lease}));
import {runCatalogWorker} from "./blog-catalog-worker";
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));mocks.lease.mockResolvedValue({claimed:true});});
afterEach(()=>vi.useRealTimers());
function database(day="2026-10-14",active:any=null,enabled=true){return{client:{findUniqueOrThrow:async()=>({id:"c",slug:"pcmidi",active:true,storeUrl:"https://shop.test"})},appSetting:{findUnique:async()=>({value:JSON.stringify({enabled})})},catalogSyncRun:{findFirst:async({where}:any)=>where.status?active:{startedAt:new Date(day+"T12:00:00Z")}}}as any;}
describe("prioridad de la cola del blog",()=>{
  it("un catálogo ya sincronizado no toma la reserva ni bloquea generación",async()=>{
    expect(await runCatalogWorker(database(),"pcmidi",{scheduled:true})).toEqual({skipped:true});expect(mocks.lease).not.toHaveBeenCalled();
  });
  it("una sincronización desactivada tampoco toma la reserva",async()=>{
    expect(await runCatalogWorker(database("2026-10-13",null,false),"pcmidi",{scheduled:true})).toEqual({skipped:true});expect(mocks.lease).not.toHaveBeenCalled();
  });
  it("un trabajo pendiente sigue protegido por la reserva",async()=>{
    await runCatalogWorker(database("2026-10-14",{id:"pending",status:"QUEUED"}),"pcmidi",{scheduled:true});expect(mocks.lease).toHaveBeenCalledWith(expect.anything(),"c",expect.any(Function));
  });
  it("la sincronización diaria vencida y las solicitudes manuales mantienen sus controles",async()=>{
    await runCatalogWorker(database("2026-10-13"),"pcmidi",{scheduled:true});await runCatalogWorker(database(),"pcmidi",{force:true});expect(mocks.lease).toHaveBeenCalledTimes(2);
  });
});

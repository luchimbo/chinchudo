import { describe,it,expect,vi,afterEach } from "vitest";
import { withBlogLease } from "../../scripts/blog-lease.mjs";
function db(){const rows=new Map<string,string>();return{appSetting:{upsert:async({where,create}:any)=>{if(!rows.has(where.key))rows.set(where.key,create.value);},findUnique:async({where}:any)=>({value:rows.get(where.key)}),updateMany:async({where,data}:any)=>{if(rows.get(where.key)!==where.value)return{count:0};rows.set(where.key,data.value);return{count:1};}},rows};}
afterEach(()=>vi.useRealTimers());
describe("reserva de trabajo del blog",()=>{
  it("serializa procesos del mismo cliente y permite otros clientes",async()=>{
    const prisma=db();let finish!:()=>void;const pending=new Promise<void>(r=>{finish=r;});const first=withBlogLease(prisma,"a",async()=>{await pending;return 1;});await new Promise(r=>setTimeout(r,5));expect(await withBlogLease(prisma,"a",async()=>2)).toBeNull();expect(await withBlogLease(prisma,"b",async()=>3)).toBe(3);finish();expect(await first).toBe(1);expect(await withBlogLease(prisma,"a",async()=>4)).toBe(4);
  });
  it("reutiliza reservas anidadas del publicador y libera ante errores",async()=>{
    const prisma=db();await expect(withBlogLease(prisma,"a",async()=>{expect(await withBlogLease(prisma,"a",async()=>42)).toBe(42);throw new Error("falló");})).rejects.toThrow("falló");expect(await withBlogLease(prisma,"a",async()=>1)).toBe(1);
  });
  it("aborta si otro trabajador tomó la reserva",async()=>{
    vi.useFakeTimers();const prisma=db();let finish!:()=>void;const done=new Promise<void>(r=>{finish=r;});let signal:AbortSignal|undefined;
    const running=withBlogLease(prisma,"a",async lease=>{signal=lease.signal;await done;expect(()=>lease.assert()).toThrow();});await vi.advanceTimersByTimeAsync(0);prisma.rows.set("blog_execution_lock:a","{}");await vi.advanceTimersByTimeAsync(20_000);expect(signal?.aborted).toBe(true);finish();await running;
  });
});

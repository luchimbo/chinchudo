import Link from "next/link";
import { prisma } from "@/lib/db";
import { createBrand, updateBrand, deleteBrand } from "./actions";
import { getVisibleClients } from "@/lib/auth";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";

export default async function BrandsPage({ searchParams }: { searchParams: { client?: string } }) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const brands = await prisma.brand.findMany({
    where: activeClient ? { clientId: activeClient.id } : undefined,
    include: { _count: { select: { products: true, responses: true } } },
    orderBy: { name: "asc" }
  });

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">Admin</p>
          <h1 className="font-display text-4xl text-ink">Marcas</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Posicionamiento, tono y claims permitidos/prohibidos. Alimentan el contexto de cada respuesta.
          </p>
        </div>
        <form>
          <select name="client" defaultValue={activeClient?.slug ?? ""} className={inputCls}>
            {clients.map((client) => <option key={client.id} value={client.slug}>{client.name}</option>)}
          </select>
          <button className="ml-2 rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink">Cambiar</button>
        </form>
        <Link href="/admin" className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          Volver
        </Link>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nueva marca</h2>
        <form action={createBrand} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
          <label className={labelCls}>
            Nombre
            <input name="name" required minLength={2} maxLength={80} className={inputCls} />
          </label>
          <label className={labelCls}>
            Tono
            <input name="tone" required minLength={2} maxLength={120} className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Posicionamiento
            <textarea name="positioning" required minLength={10} maxLength={2000} rows={2} className={`${inputCls} resize-y`} />
          </label>
          <label className={labelCls}>
            Claims permitidos
            <textarea name="allowedClaims" maxLength={2000} rows={2} className={`${inputCls} resize-y`} />
          </label>
          <label className={labelCls}>
            Claims prohibidos
            <textarea name="forbiddenClaims" maxLength={2000} rows={2} className={`${inputCls} resize-y`} />
          </label>
          <div className="flex items-end justify-end md:col-span-2">
            <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar marca</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Marcas ({brands.length})</h2>
        <div className="mt-4 grid gap-3">
          {brands.map((b) => (
            <form key={b.id} action={updateBrand} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
              <label className={labelCls}>
                Nombre
                <input name="name" defaultValue={b.name} required className={inputCls} />
              </label>
              <label className={labelCls}>
                Tono
                <input name="tone" defaultValue={b.tone} required className={inputCls} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Posicionamiento
                <textarea name="positioning" defaultValue={b.positioning} required rows={2} className={`${inputCls} resize-y`} />
              </label>
              <label className={labelCls}>
                Claims permitidos
                <textarea name="allowedClaims" defaultValue={b.allowedClaims} rows={2} className={`${inputCls} resize-y`} />
              </label>
              <label className={labelCls}>
                Claims prohibidos
                <textarea name="forbiddenClaims" defaultValue={b.forbiddenClaims} rows={2} className={`${inputCls} resize-y`} />
              </label>
              <div className="flex items-end justify-between gap-2 md:col-span-2">
                <span className="text-xs text-slate/60">{b._count.products} productos · {b._count.responses} respuestas</span>
                <div className="flex gap-2">
                  <button type="submit" aria-label={`Guardar cambios en ${b.name}`} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                  <button type="submit" formAction={deleteBrand} aria-label={`Eliminar marca ${b.name}`} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
                </div>
              </div>
            </form>
          ))}
          {brands.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin marcas cargadas.</p> : null}
        </div>
      </section>
    </main>
  );
}

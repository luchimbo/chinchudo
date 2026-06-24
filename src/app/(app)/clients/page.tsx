import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { createClient } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const hintCls = "font-normal text-slate/60 text-[11px]";

export default async function ClientsPage({ searchParams }: { searchParams?: { client?: string } }) {
  const clients = await getVisibleClients(prisma);
  const clientQuery = searchParams?.client ? `?client=${searchParams.client}` : "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink">Clientes</h1>
          <p className="mt-2 text-sm text-slate">
            Cada cliente tiene su propia configuración de marca, IA y emails.
          </p>
        </div>
        <Link href={`/admin${clientQuery}`} className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          ← Configuración
        </Link>
      </header>

      {/* Lista de clientes existentes */}
      {clients.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xl text-ink">Clientes activos</h2>
          <div className="grid gap-2">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.slug}${clientQuery}`}
                className="flex items-center justify-between rounded-lg border border-ink/10 bg-paper px-4 py-3 shadow-sm transition hover:border-ink/25 hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.active ? "#1D9E75" : "#aaa" }}
                  />
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-xs text-slate/60">{c.slug}</span>
                </div>
                <span className="text-xs text-slate">Configurar →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Crear nuevo */}
      <section>
        <h2 className="mb-3 font-display text-xl text-ink">Agregar cliente</h2>
        <form action={createClient} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
          <label className={labelCls}>
            Nombre
            <input name="name" required placeholder="Prestige Running" className={inputCls} />
          </label>
          <label className={labelCls}>
            Identificador interno
            <span className={hintCls}>Solo minúsculas y guiones.</span>
            <input name="slug" required placeholder="prestige-running" className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Descripción breve
            <input name="description" className={inputCls} />
          </label>
          {/* Campos ocultos con defaults */}
          <input type="hidden" name="autoApprove" value="" />
          <input type="hidden" name="autoPublish" value="" />
          <div className="flex items-center gap-3 md:col-span-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate">
              <input type="checkbox" name="active" defaultChecked /> Activo
            </label>
          </div>
          <div className="flex justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">
              Crear cliente
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate/60">
          Después de crear el cliente, hacé click en su nombre para configurar marca, emails e IA.
        </p>
      </section>
    </div>
  );
}

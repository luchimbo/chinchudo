import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { createSource, updateSource, deleteSource } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const CHANNELS = ["youtube", "reddit", "facebook", "instagram", "x", "tiktok", "linkedin"];

async function loadAccounts(): Promise<{ id: string; label: string; clientSlug?: string }[]> {
  try {
    const raw = await readFile(join(process.cwd(), "agents", "accounts.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, { label?: string; clientSlug?: string }>;
    return Object.entries(data).map(([id, cfg]) => ({ id, label: cfg.label ?? id, clientSlug: cfg.clientSlug }));
  } catch {
    return [];
  }
}

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleString("es-AR") : "nunca";
}

export default async function MonitoringPage({ searchParams }: { searchParams: { client?: string } }) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const [sources, recent, accounts] = await Promise.all([
    prisma.monitoredSource.findMany({ where: activeClient ? { clientId: activeClient.id } : undefined, orderBy: { label: "asc" } }),
    prisma.opportunity.findMany({
      where: {
        monitoredSourceId: { not: null },
        createdAt: { gte: since },
        ...(activeClient ? { monitoredSource: { clientId: activeClient.id } } : {}),
      },
      include: { channel: true, monitoredSource: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    loadAccounts(),
  ]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">Admin</p>
          <h1 className="font-display text-4xl text-ink">Monitoreo</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Fuentes que corre <code>npm run agents:monitor</code>. Las detecciones siguen requiriendo
            revisiÃ³n humana; nada se publica solo.
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
        <h2 className="font-display text-2xl text-ink">Nueva fuente</h2>
        <form action={createSource} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
          <label className={`${labelCls} md:col-span-2`}>Etiqueta<input name="label" required placeholder="YouTube - controlador midi" className={inputCls} /></label>
          <label className={labelCls}>
            Canal
            <select name="channel" className={inputCls}>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className={labelCls}>
            Cuenta Dolphin <span className="font-normal text-slate/60">(opcional â€” se asigna automÃ¡ticamente)</span>
            <select name="account" className={inputCls}>
              <option value="">â€” automÃ¡tico segÃºn canal â€”</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.id}{a.clientSlug ? ` / ${a.clientSlug}` : ""})</option>)}
            </select>
          </label>
          <label className={`${labelCls} md:col-span-2`}>Query / bÃºsqueda<input name="query" required className={inputCls} /></label>
          <label className={labelCls}>LÃ­mite<input name="limit" type="number" min={1} max={50} defaultValue={5} className={inputCls} /></label>
          <label className="flex items-end gap-2 text-xs font-semibold text-slate"><input name="active" type="checkbox" defaultChecked className="h-4 w-4" /> Activa</label>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar fuente</button>
          </div>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Fuentes ({sources.length})</h2>
        <div className="mt-4 grid gap-3">
          {sources.map((s) => (
            <form key={s.id} action={updateSource} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
              <label className={`${labelCls} md:col-span-2`}>Etiqueta<input name="label" defaultValue={s.label} required className={inputCls} /></label>
              <label className={labelCls}>
                Canal
                <select name="channel" defaultValue={s.channel} className={inputCls}>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label className={labelCls}>
                Cuenta Dolphin <span className="font-normal text-slate/60">(override opcional)</span>
                <select name="account" defaultValue={s.account} className={inputCls}>
                  <option value="">â€” automÃ¡tico segÃºn canal â€”</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.id}{a.clientSlug ? ` / ${a.clientSlug}` : ""})</option>)}
                </select>
              </label>
              <label className={`${labelCls} md:col-span-2`}>Query<input name="query" defaultValue={s.query} required className={inputCls} /></label>
              <label className={labelCls}>LÃ­mite<input name="limit" type="number" min={1} max={50} defaultValue={s.limit} className={inputCls} /></label>
              <label className="flex items-end gap-2 text-xs font-semibold text-slate"><input name="active" type="checkbox" defaultChecked={s.active} className="h-4 w-4" /> Activa</label>
              <div className="flex items-end justify-between gap-2 md:col-span-2">
                <span className="text-xs text-slate/60">Ãšltima corrida: {fmt(s.lastRunAt)} Â· {s.lastCount} detecciÃ³n(es)</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                  <button formAction={deleteSource} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
                </div>
              </div>
            </form>
          ))}
          {sources.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin fuentes cargadas.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Detecciones recientes (7 dÃ­as)</h2>
        <div className="mt-4 grid gap-2">
          {recent.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper p-3 text-sm transition hover:bg-white">
              <span className="truncate text-ink">{o.sourceText.slice(0, 90)}</span>
              <span className="shrink-0 text-xs text-slate/70">{o.channel.name} Â· {o.monitoredSource?.label ?? "â€”"}</span>
            </Link>
          ))}
          {recent.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin detecciones de fuentes monitoreadas en los Ãºltimos 7 dÃ­as.</p> : null}
        </div>
      </section>
    </main>
  );
}


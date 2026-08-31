import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { createSource, updateSource, deleteSource } from "./actions";
import { operationalOpportunityWhere } from "@/lib/opportunity-channels";

const inputCls = "min-w-0 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid min-w-0 gap-1 text-xs font-semibold text-slate";
const CHANNELS = ["youtube"];

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
  const argentinaNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const todayArgentina = new Date(Date.UTC(argentinaNow.getUTCFullYear(), argentinaNow.getUTCMonth(), argentinaNow.getUTCDate(), 3));
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const [sources, recent, accounts, todayCount] = await Promise.all([
    prisma.monitoredSource.findMany({ where: { ...(activeClient ? { clientId: activeClient.id } : {}), channel: "youtube" }, orderBy: { label: "asc" } }),
    prisma.opportunity.findMany({
      where: {
        ...operationalOpportunityWhere(),
        monitoredSourceId: { not: null },
        createdAt: { gte: since },
        ...(activeClient ? { clientId: activeClient.id } : {}),
      },
      include: { channel: true, monitoredSource: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    loadAccounts(),
    activeClient ? prisma.opportunity.count({ where: { clientId: activeClient.id, ...operationalOpportunityWhere(), createdAt: { gte: todayArgentina }, status: { not: "DISCARDED" } } }) : 0,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-5 sm:py-8">
      <header className="mb-8">
        <h1 className="font-display text-4xl text-ink">Monitoreo</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          Fuentes que corre <code>npm run agents:monitor</code>. Las detecciones siguen requiriendo
          revisión humana; nada se publica solo.
        </p>
      </header>

      {activeClient ? <section className="mb-8 rounded-xl border border-ink/10 bg-white/70 p-4 shadow-panel">
        <p className="text-xs font-bold uppercase tracking-wide text-slate">Cuota diaria · Argentina</p>
        <p className="mt-1 font-display text-3xl text-ink">{todayCount}/{activeClient.dailyOpportunityTarget} nuevas</p>
        <p className="mt-1 text-sm text-slate">El radar rota fuentes hasta completar oportunidades calificadas. No publica respuestas automáticamente.</p>
      </section> : null}

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nueva fuente</h2>
        <form action={createSource} className="mt-4 grid min-w-0 gap-3 rounded-lg border border-ink/10 bg-white/70 p-3 shadow-panel sm:p-4 md:grid-cols-2">
          <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
          <label className={`${labelCls} md:col-span-2`}>Etiqueta<input name="label" required placeholder="YouTube - controlador midi" className={inputCls} /></label>
          <label className={labelCls}>
            Canal
            <select name="channel" className={inputCls}>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className={labelCls}>
            Cuenta Dolphin <span className="font-normal text-slate/60">(opcional — se asigna automáticamente)</span>
            <select name="account" className={inputCls}>
              <option value="">— automático según canal —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.id}{a.clientSlug ? ` / ${a.clientSlug}` : ""})</option>)}
            </select>
          </label>
          <label className={`${labelCls} md:col-span-2`}>Query / búsqueda<input name="query" required className={inputCls} /></label>
          <label className={labelCls}>Límite<input name="limit" type="number" min={1} max={50} defaultValue={5} className={inputCls} /></label>
          <label className="flex items-end gap-2 text-xs font-semibold text-slate"><input name="active" type="checkbox" defaultChecked className="h-4 w-4" /> Activa</label>
          <div className="flex min-w-0 items-end justify-stretch md:col-span-2 md:justify-end">
            <button className="w-full rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate sm:w-auto">Agregar fuente</button>
          </div>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Fuentes ({sources.length})</h2>
        <div className="mt-4 grid gap-3">
          {sources.map((s) => (
            <form key={s.id} action={updateSource} className="grid min-w-0 gap-3 rounded-lg border border-ink/10 bg-paper p-3 sm:p-4 md:grid-cols-2">
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
                  <option value="">— automático según canal —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.id}{a.clientSlug ? ` / ${a.clientSlug}` : ""})</option>)}
                </select>
              </label>
              <label className={`${labelCls} md:col-span-2`}>Query<input name="query" defaultValue={s.query} required className={inputCls} /></label>
              <div className="md:col-span-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-ink/5 px-2.5 py-1 font-semibold text-ink">{s.lifecycle}</span>
                <span className="rounded-full bg-ink/5 px-2.5 py-1 text-slate">prioridad {s.priority}</span>
                <span className="rounded-full bg-ink/5 px-2.5 py-1 text-slate">{s.emptyReads} lectura(s) vacía(s)</span>
                {s.blockedReason ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{s.blockedReason}</span> : null}
              </div>
              <label className={labelCls}>Límite<input name="limit" type="number" min={1} max={50} defaultValue={s.limit} className={inputCls} /></label>
              <label className="flex items-end gap-2 text-xs font-semibold text-slate"><input name="active" type="checkbox" defaultChecked={s.active} className="h-4 w-4" /> Activa</label>
              <div className="flex min-w-0 flex-col gap-3 md:col-span-2 md:flex-row md:items-end md:justify-between">
                <span className="text-xs text-slate/60">Última corrida: {fmt(s.lastRunAt)} · {s.lastCount} detección(es)</span>
                <div className="grid grid-cols-2 gap-2 sm:flex">
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
        <h2 className="font-display text-2xl text-ink">Detecciones recientes (7 días)</h2>
        <div className="mt-4 grid gap-2">
          {recent.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="flex min-w-0 flex-col gap-2 rounded-md border border-ink/10 bg-paper p-3 text-sm transition hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="min-w-0 truncate text-ink">{o.sourceText.slice(0, 90)}</span>
              <span className="text-xs text-slate/70 sm:shrink-0">{o.channel.name} · {o.monitoredSource?.label ?? "—"}</span>
            </Link>
          ))}
          {recent.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin detecciones de fuentes monitoreadas en los últimos 7 días.</p> : null}
        </div>
      </section>
    </div>
  );
}


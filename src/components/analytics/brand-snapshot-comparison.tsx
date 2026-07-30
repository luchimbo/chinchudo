import type { BrandSnapshot } from "@prisma/client";
import { asSnapshotMetrics, scheduleForMilestone, type SnapshotMetrics } from "@/lib/brand-snapshots";

const milestones = ["D0", "D30", "D60", "D90", "D180", "D365"] as const;
const label: Record<(typeof milestones)[number], string> = { D0: "Día 0", D30: "Día 30", D60: "Día 60", D90: "Día 90", D180: "Día 180", D365: "Día 365" };
const metricRows: Array<[keyof SnapshotMetrics, string, string]> = [["configuration", "activeSources", "Fuentes activas"], ["configuration", "products", "Productos"], ["funnel", "opportunities", "Oportunidades"], ["funnel", "responses", "Borradores"], ["funnel", "approvedResponses", "Aprobadas"], ["funnel", "published", "Publicadas"], ["funnel", "converted", "Convertidas"], ["landings", "total", "Landings"], ["landings", "leads", "Leads"], ["tracking", "total", "Eventos internos"]];
const formatDate = (date: Date) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(date);

export function BrandSnapshotComparison({ snapshots, clientName }: { snapshots: BrandSnapshot[]; clientName: string }) {
  const baseline = snapshots.find((snapshot) => snapshot.milestone === "D0");
  if (!baseline) {
    return <section className="rounded-2xl border border-moss/20 bg-gradient-to-br from-moss/10 via-white to-white p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-moss">Seguimiento programado</p>
          <h2 className="mt-1 font-display text-3xl text-ink">Foto de marca: {clientName}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate">Compará el crecimiento con una foto inicial y cortes programados. El seguimiento empieza cuando se registre el Día 0.</p>
        </div>
        <div className="rounded-xl border border-brass/20 bg-brass/5 px-4 py-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brass">Próximo paso</p>
          <p className="mt-1 text-lg font-bold text-ink">Registrar Día 0</p>
          <p className="mt-1 text-xs text-slate">Así se programan los cortes siguientes.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {milestones.map((milestone) => <div key={milestone} className="rounded-lg border border-dashed border-ink/15 bg-white/60 px-3 py-3">
          <p className="text-xs font-bold text-slate">○ {label[milestone]}</p>
          <p className="mt-1 text-[11px] text-slate/65">Pendiente de programar</p>
        </div>)}
      </div>
    </section>;
  }
  const completed = new Set(snapshots.map((snapshot) => snapshot.milestone));
  const nextMilestone = milestones.find((milestone) => !completed.has(milestone));
  const nextDate = nextMilestone ? scheduleForMilestone(baseline.baselineAt, nextMilestone) : null;
  const latest = [...snapshots].sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()).at(-1)!;
  const metrics = asSnapshotMetrics(latest.metrics);

  return <section className="rounded-2xl border border-moss/20 bg-gradient-to-br from-moss/10 via-white to-white p-6 shadow-panel">
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-moss">Seguimiento programado</p><h2 className="mt-1 font-display text-3xl text-ink">Foto de marca: {clientName}</h2><p className="mt-1 text-sm text-slate">Día 0 guardado el {formatDate(baseline.baselineAt)}. Solo datos internos de este cliente.</p></div>
      <div className="rounded-xl border border-moss/20 bg-white px-4 py-3 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-moss">Próximo corte</p><p className="mt-1 text-lg font-bold text-ink">{nextMilestone && nextDate ? `${label[nextMilestone]} · ${formatDate(nextDate)}` : "Seguimiento completo"}</p><p className="mt-1 text-xs text-slate">Programado para las 12:00 ART.</p></div>
    </div>
    <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{milestones.map((milestone) => { const done = completed.has(milestone); const date = scheduleForMilestone(baseline.baselineAt, milestone); return <div key={milestone} className={`rounded-lg border px-3 py-2 ${done ? "border-moss/20 bg-moss/10" : "border-ink/10 bg-white/70"}`}><p className={`text-xs font-bold ${done ? "text-moss" : "text-slate"}`}>{done ? "✓ " : "○ "}{label[milestone]}</p><p className="mt-1 text-[11px] text-slate">{formatDate(date)}</p></div>; })}</div>
    <div className="mt-6"><table className="w-full table-fixed text-sm"><thead><tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-slate"><th className="w-3/4 py-2">Métrica ({label[latest.milestone as keyof typeof label]})</th><th className="w-1/4 py-2 text-right">Valor</th></tr></thead><tbody>{metricRows.map(([section, key, title]) => <tr key={key} className="border-b border-ink/5"><td className="py-2.5">{title}</td><td className="py-2.5 text-right tabular-nums">{metrics[section][key] ?? 0}</td></tr>)}</tbody></table></div>
  </section>;
}

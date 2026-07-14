import type { BrandSnapshot } from "@prisma/client";
import { asSnapshotMetrics, type SnapshotMetrics } from "@/lib/brand-snapshots";

const label: Record<string, string> = { D0: "Día 0", D30: "Día 30", D60: "Día 60", D90: "Día 90", D180: "Día 180", D365: "Día 365" };
const metricRows: Array<[keyof SnapshotMetrics, string, string]> = [["configuration", "activeSources", "Fuentes activas"], ["configuration", "products", "Productos"], ["funnel", "opportunities", "Oportunidades"], ["funnel", "responses", "Borradores"], ["funnel", "approvedResponses", "Aprobadas"], ["funnel", "published", "Publicadas"], ["funnel", "converted", "Convertidas"], ["landings", "total", "Landings"], ["landings", "leads", "Leads"], ["tracking", "total", "Eventos internos"]];

function value(snapshot: BrandSnapshot | undefined, section: keyof SnapshotMetrics, key: string) {
  if (!snapshot) return "-";
  return asSnapshotMetrics(snapshot.metrics)[section][key] ?? 0;
}

export function BrandSnapshotComparison({ snapshots }: { snapshots: Array<BrandSnapshot & { client: { name: string; slug: string } }> }) {
  const milestones = ["D0", "D30", "D60", "D90", "D180", "D365"];
  const latest = milestones.map((milestone) => ({ milestone, prestige: snapshots.find((s) => s.milestone === milestone && s.client.slug === "prestige-running"), jurispedia: snapshots.find((s) => s.milestone === milestone && s.client.slug === "jurispedia") })).filter((row) => row.prestige || row.jurispedia).at(-1);
  if (!latest) return <section className="rounded-xl border border-dashed border-ink/15 bg-white/50 p-5"><h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">Foto de marca</h2><p className="mt-3 text-sm text-slate">La línea base se generará automáticamente a las 12:00 de Argentina.</p></section>;
  return <section className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel"><div><h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">Foto de marca comparativa</h2><p className="mt-1 text-sm text-slate">{label[latest.milestone]} - datos internos inmutables</p></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-slate"><th className="py-2">Métrica</th><th className="py-2 text-right">Prestige</th><th className="py-2 text-right">Jurispedia</th></tr></thead><tbody>{metricRows.map(([section, key, title]) => <tr key={key} className="border-b border-ink/5"><td className="py-2.5">{title}</td><td className="py-2.5 text-right tabular-nums">{value(latest.prestige, section, key)}</td><td className="py-2.5 text-right tabular-nums">{value(latest.jurispedia, section, key)}</td></tr>)}</tbody></table></div></section>;
}

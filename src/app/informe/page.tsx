import Link from "next/link";
import { prisma } from "@/lib/db";

function fmt(d: Date | null | string | undefined) {
  if (!d) return "nunca";
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

const CANAL_LABEL: Record<string, string> = {
  REDDIT: "Reddit",
  LINKEDIN: "LinkedIn",
  TWITTER: "Twitter / X",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  NEWSLETTER: "Newsletter",
  FORUM: "Foros",
};

export default async function InformePage() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

  const [
    // Oportunidades / respuestas
    oppsTotal,
    oppsLast30,
    oppsRespondidas,
    oppsByChannel,
    publishingLogs,
    publishingByAccount,
    publishingByResult,

    // Blog / landings
    landingsTotal,
    landingsPublished,
    landingsLast30,
    topLandingsByVisits,
    totalVisits,
    visitsByReferrer,

    // Contactos / nurture
    leadsTotal,
    leadsLast30,
    nurtureTotal,
    nurtureSent,
    nurtureFailed,

    // Distribución en redes
    distTotal,
    distPublished,
    distByCanal,

    // GEO / IAs
    geoTotal,
    geoAvg,
    geoRecent,

    // Monitoreo
    sources,
    systemErrors,
  ] = await Promise.all([
    // Oportunidades
    prisma.opportunity.count(),
    prisma.opportunity.count({ where: { createdAt: { gte: since30 } } }),
    prisma.opportunity.count({ where: { status: { in: ["PUBLISHED", "CONVERTED"] } } }),
    prisma.opportunity.groupBy({ by: ["channelId"], _count: { id: true } }),
    prisma.publishingLog.count(),
    prisma.publishingLog.groupBy({ by: ["account"], _count: { id: true } }),
    prisma.publishingLog.groupBy({ by: ["result"], _count: { id: true } }),

    // Blog
    prisma.landing.count(),
    prisma.landing.count({ where: { status: "PUBLISHED" } }),
    prisma.landing.count({ where: { createdAt: { gte: since30 } } }),
    prisma.trackingEvent.groupBy({
      by: ["slug"], _count: { id: true },
      where: { eventType: "page_view" },
    }),
    prisma.trackingEvent.count({ where: { eventType: "page_view" } }),
    prisma.trackingEvent.groupBy({
      by: ["referrer"], _count: { id: true },
      where: { eventType: "page_view", referrer: { not: "" } },
    }),

    // Contactos
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: { gte: since30 } } }),
    prisma.nurtureStep.count(),
    prisma.nurtureStep.count({ where: { status: "SENT" } }),
    prisma.nurtureStep.count({ where: { status: "FAILED" } }),

    // Distribución
    prisma.distributionPiece.count(),
    prisma.distributionPiece.count({ where: { status: "PUBLISHED" } }),
    prisma.distributionPiece.groupBy({
      by: ["canal"], _count: { id: true },
      where: { status: "PUBLISHED" },
    }),

    // GEO
    prisma.geoAudit.count(),
    prisma.geoAudit.aggregate({ _avg: { score: true }, _max: { score: true } }),
    prisma.geoAudit.findMany({ orderBy: { createdAt: "desc" }, take: 3,
      select: { score: true, modeloIA: true, createdAt: true, prompt: true } }),

    // Monitoreo
    prisma.monitoredSource.findMany({ where: { active: true },
      orderBy: { lastRunAt: "desc" }, take: 8,
      select: { label: true, channel: true, lastRunAt: true, lastCount: true } }),
    prisma.systemLog.count({ where: { level: "error", createdAt: { gte: since7 } } }),
  ]);

  // Resolver channelIds → nombres
  const channelIds = oppsByChannel.map(r => r.channelId);
  const channels = await prisma.channel.findMany({ where: { id: { in: channelIds } },
    select: { id: true, name: true } });
  const channelMap = Object.fromEntries(channels.map(c => [c.id, c.name]));

  // Ordenar resultados de groupBy en JS (Prisma 5 no acepta orderBy por _count en groupBy)
  const sort = <T extends { _count: { id: number } }>(arr: T[]) =>
    [...arr].sort((a, b) => b._count.id - a._count.id);

  const oppsByChannelSorted   = sort(oppsByChannel).slice(0, 8);
  const byAccountSorted       = sort(publishingByAccount).slice(0, 10);
  const byResultSorted        = sort(publishingByResult);
  const topLandingsSorted     = sort(topLandingsByVisits as { slug: string; _count: { id: number } }[]).slice(0, 8);
  const visitsByReferrerSorted = sort(visitsByReferrer).slice(0, 6);
  const distByCanalSorted     = sort(distByCanal);

  const conversionRate = pct(oppsRespondidas, oppsTotal);
  const nurtureDelivery = pct(nurtureSent, nurtureTotal);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-5 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">Informe de actividad</h1>
          <p className="mt-0.5 text-sm text-slate">Todo lo que hicieron los agentes. Números reales, sin rodeos.</p>
        </div>
        {systemErrors > 0 && (
          <div className="rounded-xl border border-signal/30 bg-signal/10 px-4 py-2 text-center">
            <p className="text-xs font-semibold text-signal">{systemErrors} errores</p>
            <p className="text-xs text-signal/70">últimos 7 días</p>
          </div>
        )}
      </header>

      {/* ── 1. OPORTUNIDADES Y RESPUESTAS ── */}
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate/60">Oportunidades en redes</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Detectadas en total" value={oppsTotal} />
          <Stat label="Últimos 30 días" value={oppsLast30} />
          <Stat label="Respondidas" value={oppsRespondidas} sub={`${conversionRate} del total`} accent="moss" />
          <Stat label="Publicaciones hechas" value={publishingLogs} />
        </div>

        {oppsByChannelSorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate/60">Por red social</p>
            <div className="flex flex-col gap-1">
              {oppsByChannelSorted.map(r => (
                <Bar key={r.channelId}
                  label={channelMap[r.channelId] ?? r.channelId}
                  value={r._count.id} max={oppsByChannelSorted[0]._count.id} />
              ))}
            </div>
          </div>
        )}

        {byAccountSorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate/60">Por cuenta usada</p>
            <div className="flex flex-wrap gap-2">
              {byAccountSorted.map(r => (
                <Chip key={r.account} label={r.account || "sin cuenta"} value={r._count.id} />
              ))}
            </div>
          </div>
        )}

        {byResultSorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate/60">Resultado de las respuestas</p>
            <div className="flex flex-wrap gap-2">
              {byResultSorted.map(r => (
                <Chip key={r.result} label={r.result.replace(/_/g, " ")} value={r._count.id} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 2. BLOG / LANDINGS ── */}
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate/60">Blog (artículos SEO)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Artículos creados" value={landingsTotal} />
          <Stat label="Publicados" value={landingsPublished} sub={pct(landingsPublished, landingsTotal)} accent="moss" />
          <Stat label="Creados este mes" value={landingsLast30} />
          <Stat label="Visitas totales al blog" value={totalVisits} />
        </div>

        {topLandingsSorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate/60">Artículos más visitados</p>
            <div className="flex flex-col gap-1">
              {topLandingsSorted.map(r => (
                <Bar key={r.slug} label={r.slug} value={r._count.id} max={topLandingsSorted[0]._count.id} unit="visitas" />
              ))}
            </div>
          </div>
        )}

        {visitsByReferrerSorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate/60">De dónde llega la gente</p>
            <div className="flex flex-wrap gap-2">
              {visitsByReferrerSorted.map(r => (
                <Chip key={r.referrer} label={r.referrer} value={r._count.id} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 3. CONTACTOS Y EMAILS ── */}
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate/60">Contactos y emails automáticos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Contactos en total" value={leadsTotal} />
          <Stat label="Nuevos este mes" value={leadsLast30} />
          <Stat label="Emails enviados" value={nurtureSent} sub={`${nurtureDelivery} de entrega`} accent="moss" />
          <Stat label="Emails fallidos" value={nurtureFailed} accent={nurtureFailed > 0 ? "signal" : undefined} />
        </div>
      </section>

      {/* ── 4. DISTRIBUCIÓN EN REDES ── */}
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate/60">Publicaciones en redes (agente automático)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Piezas generadas" value={distTotal} />
          <Stat label="Publicadas" value={distPublished} sub={pct(distPublished, distTotal)} accent="moss" />
          <Stat label="Pendientes de aprobar" value={distTotal - distPublished} />
        </div>

        {distByCanalSorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate/60">Publicadas por red</p>
            <div className="flex flex-col gap-1">
              {distByCanalSorted.map(r => (
                <Bar key={r.canal}
                  label={CANAL_LABEL[r.canal] ?? r.canal}
                  value={r._count.id}
                  max={distByCanalSorted[0]._count.id} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 5. PRESENCIA EN IAs ── */}
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate/60">Presencia en IAs (ChatGPT, Gemini, Claude…)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Consultas realizadas" value={geoTotal} />
          <Stat label="Visibilidad promedio"
            value={geoAvg._avg.score ? `${geoAvg._avg.score.toFixed(1)}/5` : "—"}
            accent={geoAvg._avg.score && geoAvg._avg.score >= 3 ? "moss" : "signal"} />
          <Stat label="Mejor resultado" value={geoAvg._max.score !== null ? `${geoAvg._max.score}/5` : "—"} />
        </div>

        {geoRecent.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate/60">Últimas consultas</p>
            {geoRecent.map((g, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-ink/8 bg-paper px-4 py-3">
                <span className={`text-xl font-bold tabular-nums ${g.score >= 4 ? "text-moss" : g.score >= 2 ? "text-brass" : "text-signal"}`}>
                  {g.score}/5
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink/80 italic truncate">"{g.prompt}"</p>
                  <p className="text-xs text-slate/60">{g.modeloIA} · {fmt(g.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 6. MONITOREO ── */}
      {sources.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate/60">Fuentes monitoreadas</h2>
          <div className="flex flex-col gap-2">
            {sources.map(s => (
              <div key={s.label} className="flex items-center justify-between rounded-lg border border-ink/8 bg-paper px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-ink">{s.label}</span>
                  <span className="ml-2 text-xs text-slate/60">{s.channel}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">{s.lastCount} resultados</p>
                  <p className="text-xs text-slate/60">última corrida: {fmt(s.lastRunAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/* ── Componentes internos ── */

function Stat({ label, value, sub, accent }: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "moss" | "signal";
}) {
  const valueClass = accent === "moss" ? "text-moss" : accent === "signal" ? "text-signal" : "text-ink";
  return (
    <div className="rounded-xl border border-ink/10 bg-paper px-4 py-4 shadow-sm">
      <p className="text-xs text-slate/70 leading-tight">{label}</p>
      <p className={`mt-1.5 font-display text-3xl leading-none tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate/60">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max, unit = "oportunidades" }: {
  label: string;
  value: number;
  max: number;
  unit?: string;
}) {
  const pctW = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 truncate text-right text-xs text-slate">{label}</span>
      <div className="flex-1 rounded-full bg-ink/8 h-2 overflow-hidden">
        <div className="h-full rounded-full bg-moss/60" style={{ width: `${pctW}%` }} />
      </div>
      <span className="w-16 text-xs text-slate tabular-nums">{value} {unit}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/4 px-3 py-1 text-xs">
      <span className="text-slate">{label}</span>
      <span className="font-bold text-ink tabular-nums">{value}</span>
    </span>
  );
}

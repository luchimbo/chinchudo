import Link from "next/link";
import { ANALYTICS_PERIODS, analyticsPeriodStart, getAnalyticsData, type AnalyticsPeriod } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { deleteSystemLog, clearAllSystemErrors } from "./actions";
import {
  BrandChart,
  ChannelChart,
  IntentChart,
  PersonaChart,
  PipelineChart,
  ResultChart,
  WeeklyTrendChart,
} from "@/components/analytics/charts";
import { WeeklySummary } from "@/components/analytics/weekly-summary";
import { BrandSnapshotComparison } from "@/components/analytics/brand-snapshot-comparison";

// ─── Componentes de Presentación ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "moss" | "brass" | "signal" | "slate";
}) {
  const accentClass = {
    moss:   "text-moss",
    brass:  "text-brass",
    signal: "text-signal",
    slate:  "text-slate",
  }[accent ?? "slate"] ?? "text-ink";

  return (
    <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur transition-all duration-300 hover:shadow-md hover:border-ink/20">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate/60">{label}</p>
      <p className={`mt-2 font-display text-4xl leading-none ${accentClass}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-slate/55 leading-tight">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur ${className}`}>
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">{title}</h2>
      {children}
    </div>
  );
}

function EmptyChart({ label = "Sin datos suficientes aún" }: { label?: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-ink/15 bg-ink/[0.01]">
      <p className="text-sm text-slate/40 italic">{label}</p>
    </div>
  );
}

function InactiveModule({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex items-center justify-between gap-5 rounded-xl border border-dashed border-ink/15 bg-white/45 px-5 py-4">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate/65">{title}</h2>
        <p className="mt-1 text-sm text-slate/60">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-slate/70">Sin actividad</span>
    </section>
  );
}

function Bar({ label, value, max, unit = "ítems" }: {
  label: string;
  value: number;
  max: number;
  unit?: string;
}) {
  const pctW = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-right text-xs text-slate sm:w-36">{label}</span>
      <div className="flex-1 rounded-full bg-ink/8 h-2 overflow-hidden">
        <div className="h-full rounded-full bg-moss/50" style={{ width: `${pctW}%` }} />
      </div>
      <span className="w-12 shrink-0 text-xs text-slate tabular-nums sm:w-20">{value} {unit}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/4 px-3 py-1 text-xs">
      <span className="text-slate/75">{label}</span>
      <span className="font-bold text-ink/80 tabular-nums">{value}</span>
    </span>
  );
}

function PeriodComparison({ label, current, previous }: { label: string; current: number; previous: number }) {
  const delta = current - previous;
  const percentage = previous > 0 ? Math.round((delta / previous) * 100) : null;
  const tone = delta > 0 ? "text-moss" : delta < 0 ? "text-signal" : "text-slate";
  const detail = percentage === null ? (current > 0 ? "Sin base anterior" : "Sin cambios") : `${delta >= 0 ? "+" : ""}${percentage}%`;
  return <div className="min-w-0 rounded-lg border border-ink/10 bg-white/60 px-3 py-2.5"><p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate/60">{label}</p><div className="mt-1 flex items-baseline justify-between gap-2"><p className="font-display text-2xl leading-none text-ink">{current}</p><p className={`shrink-0 text-xs font-bold ${tone}`}>{detail}</p></div><p className="mt-1 text-[10px] text-slate/55">Antes: {previous}</p></div>;
}

// ─── Helpers y Mapeos ────────────────────────────────────────────────────────

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

function fmtDate(d: Date | null | string | undefined) {
  if (!d) return "nunca";
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

type PageProps = {
  searchParams: { client?: string; showErrors?: string; period?: string; from?: string; to?: string };
};

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  all: "Todo",
};

function dateParam(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function priorPeriod(period: AnalyticsPeriod, range: { from?: Date; to?: Date }) {
  if (range.from && range.to) {
    const duration = range.to.getTime() - range.from.getTime() + 1;
    const to = new Date(range.from.getTime() - 1);
    return { from: new Date(to.getTime() - duration + 1), to, label: "vs. rango anterior equivalente" };
  }
  if (range.from || range.to) return null;
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const currentStart = analyticsPeriodStart(period)!;
  const to = new Date(currentStart.getTime() - 1);
  return { from: new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000), to, label: `vs. ${days} días anteriores` };
}

// ─── Componente Principal ───────────────────────────────────────────────────

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const { client: clientSlug, showErrors } = searchParams;
  const period: AnalyticsPeriod = ANALYTICS_PERIODS.includes(searchParams.period as AnalyticsPeriod)
    ? searchParams.period as AnalyticsPeriod
    : "30d";

  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === clientSlug) ?? clients[0] ?? null;

  const range = { from: dateParam(searchParams.from), to: dateParam(searchParams.to, true) };
  const hasCustomRange = Boolean(range.from || range.to);
  const data = await getAnalyticsData(activeClient?.id, period, range);
  const comparisonPeriod = priorPeriod(period, range);
  const previousData = comparisonPeriod ? await getAnalyticsData(activeClient?.id, period, comparisonPeriod) : null;
  const brandSnapshots = await prisma.brandSnapshot.findMany({
    where: activeClient ? { clientId: activeClient.id } : { id: "__no_client__" },
    orderBy: { capturedAt: "asc" },
  });

  const draftRate =
    data.totalOpportunities > 0
      ? Math.round((data.totalDrafted / data.totalOpportunities) * 100)
      : 0;

  const approvalRate =
    data.totalDrafted > 0
      ? Math.round((data.totalApproved / data.totalDrafted) * 100)
      : 0;

  const periodStart = range.from ?? analyticsPeriodStart(period);
  const createdDuringPeriod = periodStart || range.to
    ? { createdAt: { ...(periodStart ? { gte: periodStart } : {}), ...(range.to ? { lte: range.to } : {}) } }
    : {};
  const since7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const cf = activeClient ? { clientId: activeClient.id } : {};

  const [
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

    systemErrors,
    errorLogs,
  ] = await Promise.all([
    // Blog
    prisma.landing.count({ where: cf }),
    prisma.landing.count({ where: { status: "PUBLISHED", ...cf } }),
    prisma.landing.count({ where: { ...createdDuringPeriod, ...cf } }),
    prisma.trackingEvent.groupBy({
      by: ["slug"], _count: { id: true },
      where: { eventType: "page_view", ...createdDuringPeriod, ...cf },
    }),
    prisma.trackingEvent.count({ where: { eventType: "page_view", ...createdDuringPeriod, ...cf } }),
    prisma.trackingEvent.groupBy({
      by: ["referrer"], _count: { id: true },
      where: { eventType: "page_view", referrer: { not: "" }, ...createdDuringPeriod, ...cf },
    }),

    // Contactos
    prisma.lead.count({ where: { ...createdDuringPeriod, ...cf } }),
    prisma.lead.count({ where: { ...createdDuringPeriod, ...cf } }),
    prisma.nurtureStep.count({ where: { ...createdDuringPeriod, ...cf } }),
    prisma.nurtureStep.count({ where: { status: "SENT", ...createdDuringPeriod, ...cf } }),
    prisma.nurtureStep.count({ where: { status: "FAILED", ...createdDuringPeriod, ...cf } }),

    // Distribución
    prisma.distributionPiece.count({ where: { ...createdDuringPeriod, ...cf } }),
    prisma.distributionPiece.count({ where: { status: "PUBLISHED", ...createdDuringPeriod, ...cf } }),
    prisma.distributionPiece.groupBy({
      by: ["canal"], _count: { id: true },
      where: { status: "PUBLISHED", ...createdDuringPeriod, ...cf },
    }),

    // GEO
    prisma.geoAudit.count({ where: { ...createdDuringPeriod, ...cf } }),
    prisma.geoAudit.aggregate({ where: { ...createdDuringPeriod, ...cf }, _avg: { score: true }, _max: { score: true } }),
    prisma.geoAudit.findMany({
      where: { ...createdDuringPeriod, ...cf },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { score: true, modeloIA: true, createdAt: true, prompt: true }
    }),

    activeClient?.slug === "pcmidi"
      ? prisma.systemLog.count({ where: { level: "error", createdAt: { gte: since7 } } })
      : Promise.resolve(0),
    activeClient?.slug === "pcmidi" && showErrors === "1"
      ? prisma.systemLog.findMany({
          where: { level: "error", createdAt: { gte: since7 } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  // Ordenar resultados del groupBy de landings y referrers
  const sortCounts = <T extends { _count: { id: number } }>(arr: T[]) =>
    [...arr].sort((a, b) => b._count.id - a._count.id);

  const topLandingsSorted = sortCounts(topLandingsByVisits as { slug: string; _count: { id: number } }[]).slice(0, 8);
  const visitsByReferrerSorted = sortCounts(visitsByReferrer).slice(0, 6);
  const distByCanalSorted = sortCounts(distByCanal);

  return (
    <div className="analytics-page mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-6 sm:px-5 sm:py-8 lg:px-8">
      {/* Header unificado */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/5 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-moss">{activeClient?.name ?? "Todos los clientes"}</p>
          <h1 className="mt-2 font-display text-4xl leading-none text-ink md:text-5xl">Analítica & Informe de Actividad</h1>
          <p className="mt-2 text-sm text-slate">
            Métricas de conversión, rendimiento SEO, nutrición de contactos y log operativo de los agentes.
          </p>
        </div>

        {systemErrors > 0 && (
          <Link
            href={
              showErrors === "1"
                ? `/analytics${clientSlug ? `?client=${clientSlug}` : ""}`
                : `/analytics?${clientSlug ? `client=${clientSlug}&` : ""}showErrors=1`
            }
            className="group block rounded-xl border border-signal/30 bg-signal/10 px-4 py-2 text-center hover:bg-signal/15 transition duration-200"
          >
            <p className="text-xs font-semibold text-signal group-hover:underline">
              {systemErrors} {systemErrors === 1 ? "error" : "errores"}
            </p>
            <p className="text-[10px] text-signal/70">últimos 7 días</p>
            <p className="mt-1 text-[9px] font-medium text-signal/90 uppercase tracking-wider group-hover:text-signal">
              {showErrors === "1" ? "Ocultar detalles ▲" : "Ver detalles ▼"}
            </p>
          </Link>
        )}
      </header>

      <nav aria-label="Período de análisis" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate/55">Período</span>
        {ANALYTICS_PERIODS.map((option) => {
          const params = new URLSearchParams();
          if (clientSlug) params.set("client", clientSlug);
          params.set("period", option);
          return (
            <Link
              key={option}
              href={`/analytics?${params.toString()}`}
              aria-current={period === option ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                period === option
                  ? "bg-ink text-paper shadow-sm"
                  : "border border-ink/10 bg-white/60 text-slate hover:border-ink/25 hover:text-ink"
              }`}
            >
              {PERIOD_LABELS[option]}
            </Link>
          );
        })}
        <form action="/analytics" className="ml-auto flex flex-wrap items-end gap-2 rounded-lg border border-ink/10 bg-white/60 px-3 py-2">
          {clientSlug && <input type="hidden" name="client" value={clientSlug} />}
          <input type="hidden" name="period" value={period} />
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/60">
            Desde
            <input name="from" type="date" defaultValue={searchParams.from} className="rounded border border-ink/10 bg-paper px-2 py-1 text-xs font-medium normal-case tracking-normal text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/60">
            Hasta
            <input name="to" type="date" defaultValue={searchParams.to} className="rounded border border-ink/10 bg-paper px-2 py-1 text-xs font-medium normal-case tracking-normal text-ink" />
          </label>
          <button type="submit" className="rounded bg-moss px-3 py-1.5 text-xs font-bold text-paper transition hover:bg-ink">Aplicar</button>
          {hasCustomRange && <Link href={`/analytics?${clientSlug ? `client=${clientSlug}&` : ""}period=${period}`} className="pb-1 text-xs font-semibold text-slate hover:text-ink">Limpiar</Link>}
        </form>
        <span className="ml-1 text-xs text-slate/55">Datos registrados en {hasCustomRange ? "el rango elegido" : PERIOD_LABELS[period].toLowerCase()}.</span>
      </nav>

      {previousData && comparisonPeriod ? <section className="rounded-xl border border-ink/10 bg-ink/[0.02] p-4"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">Comparativa del período</h2><p className="text-xs text-slate/60">{comparisonPeriod.label}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><PeriodComparison label="Oportunidades" current={data.totalOpportunities} previous={previousData.totalOpportunities}/><PeriodComparison label="Borradores" current={data.totalDrafted} previous={previousData.totalDrafted}/><PeriodComparison label="Aprobadas" current={data.totalApproved} previous={previousData.totalApproved}/><PeriodComparison label="Publicadas" current={data.totalPublished} previous={previousData.totalPublished}/><PeriodComparison label="Conversiones" current={data.totalConverted} previous={previousData.totalConverted}/></div></section> : <section className="rounded-xl border border-dashed border-ink/15 bg-white/40 px-4 py-3 text-sm text-slate/65">Elegí un período o un rango completo para ver la comparación con el período anterior.</section>}

      {/* ── PANEL DE DETALLE DE ERRORES (Solo si showErrors === "1") ── */}
      {activeClient?.slug === "pcmidi" && showErrors === "1" && (
        <section className="rounded-2xl border border-signal/20 bg-signal/5 p-6 animate-fadeIn">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-signal">Errores recientes detectados</h2>
              <p className="text-xs text-slate">Lista de fallas operativas en los últimos 7 días con guías de solución rápida.</p>
            </div>
            <div className="flex gap-3">
              <form action={clearAllSystemErrors}>
                <button
                  type="submit"
                  className="rounded-full border border-signal/30 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal hover:bg-signal/20 transition duration-150"
                >
                  Limpiar registro
                </button>
              </form>
              <Link
                href={`/analytics${clientSlug ? `?client=${clientSlug}` : ""}`}
                className="text-xs font-semibold text-slate hover:text-ink hover:underline self-center"
              >
                Cerrar panel
              </Link>
            </div>
          </div>

          {errorLogs.length === 0 ? (
            <p className="text-sm text-slate italic">No se encontraron registros de error en el sistema.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {errorLogs.map((log) => {
                const fix = getErrorFix(log.event, log.message, log.meta);
                return (
                  <div key={log.id} className="rounded-xl border border-ink/10 bg-paper p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink/5 pb-3">
                      <div>
                        <span className="inline-block rounded bg-signal/15 px-2 py-0.5 text-[10px] font-bold text-signal uppercase tracking-wider">
                          {log.event}
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-ink">{fix.title}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate tabular-nums">
                          {new Date(log.createdAt).toLocaleString("es-AR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <form action={deleteSystemLog}>
                          <input type="hidden" name="id" value={log.id} />
                          <button
                            type="submit"
                            title="Eliminar este log"
                            className="text-slate hover:text-signal text-xs font-bold transition select-none outline-none"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    </div>

                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-slate">Mensaje original:</p>
                        <p className="text-xs font-mono bg-ink/4 rounded px-2 py-1 mt-0.5 text-ink/80 break-words">{log.message}</p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate">¿Qué significa?</p>
                        <p className="text-xs text-ink/80 mt-0.5">{fix.explanation}</p>
                      </div>

                      <div className="rounded-lg border border-brass/30 bg-brass/5 p-3">
                        <p className="text-xs font-bold text-brass flex items-center gap-1.5">
                          🔧 Solución sugerida:
                        </p>
                        <p className="text-xs text-ink/95 mt-1 leading-relaxed">{fix.action}</p>
                      </div>

                      {log.meta && Object.keys(log.meta as object).length > 0 && (
                        <details className="group mt-2 border-t border-ink/5 pt-2">
                          <summary className="cursor-pointer text-[11px] font-medium text-slate hover:text-ink select-none outline-none">
                            Ver metadatos técnicos y contexto ({Object.keys(log.meta as object).length} campos)
                          </summary>
                          <pre className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-ink/4 p-3 font-mono text-[10px] text-ink/75 leading-normal whitespace-pre-wrap break-all">
                            {JSON.stringify(log.meta, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <BrandSnapshotComparison snapshots={brandSnapshots} clientName={activeClient?.name ?? "Cliente"} />

      {/* ── SECCIÓN 1: OPORTUNIDADES Y RESPUESTAS EN REDES ── */}
      <section className="flex flex-col gap-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate/50">1. Oportunidades y Conversación en Redes</h2>
        
        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Oportunidades nuevas" value={data.totalOpportunities} sub="Detectadas en el período" />
          <StatCard label="Con borrador" value={data.totalDrafted} accent="slate" sub={`${draftRate}% sobre oportunidades`} />
          <StatCard label="Borradores aprobados" value={data.totalApproved} accent="brass" sub={`${approvalRate}% de los borradores`} />
          <StatCard label="Publicaciones reales" value={data.totalPublished} accent="moss" sub="Según el registro de publicación" />
          <StatCard label="Conversiones" value={data.totalConverted} accent="brass" sub="Resultado atribuido a una publicación" />
        </div>

        {/* Resumen semanal IA */}
        <WeeklySummary period={period} />

        {/* Gráficos Operativos */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Estado actual de la cohorte">
            <PipelineChart data={data.statusCounts} />
          </ChartCard>
          <ChartCard title="Actividad semanal del período">
            <WeeklyTrendChart data={data.weeklyTrend} />
          </ChartCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Oportunidades por canal">
            {data.channelCounts.length > 0 ? (
              <ChannelChart data={data.channelCounts} />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
          <ChartCard title="Oportunidades por marca">
            {data.brandCounts.length > 0 ? (
              <BrandChart data={data.brandCounts} />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Intenciones detectadas">
            {data.intentCounts.length > 0 ? (
              <IntentChart data={data.intentCounts} />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
          <ChartCard title="Personas más usadas (respuestas)">
            {data.personaCounts.length > 0 ? (
              <PersonaChart data={data.personaCounts} />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Productos más consultados */}
          <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
              Productos más consultados
            </h2>
            {data.productCounts.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {data.productCounts.map((p, i) => (
                    <tr key={p.product} className="border-t border-ink/5 first:border-t-0">
                      <td className="py-2.5 pr-3 text-slate/50 tabular-nums">{i + 1}</td>
                      <td className="py-2.5 font-medium text-ink">{p.product}</td>
                      <td className="py-2.5 text-right font-bold text-slate/80 tabular-nums">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyChart />
            )}
          </div>

          <ChartCard title="Resultados de publicación">
            {data.resultCounts.length > 0 ? (
              <ResultChart data={data.resultCounts} />
            ) : (
              <EmptyChart label="Sin publicaciones registradas aún" />
            )}
          </ChartCard>
        </div>
      </section>

      {/* ── SECCIÓN 2: BLOG SEO Y TRÁFICO WEB ── */}
      {landingsTotal === 0 && totalVisits === 0 ? (
        <InactiveModule title="2. Blog de contenidos y tráfico SEO" description="Todavía no hay artículos ni visitas registrados en este período." />
      ) : (
      <section className="flex flex-col gap-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate/50">2. Blog de Contenidos y Tráfico SEO</h2>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Artículos creados" value={landingsTotal} />
          <StatCard label="Publicados" value={landingsPublished} sub={pct(landingsPublished, landingsTotal)} accent="moss" />
          <StatCard label="Creados en el período" value={landingsLast30} />
          <StatCard label="Visitas del período" value={totalVisits} accent="brass" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Artículos más visitados */}
          <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur flex flex-col justify-between">
            <div>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
                Artículos más visitados
              </h2>
              {topLandingsSorted.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {topLandingsSorted.map(r => (
                    <Bar key={r.slug} label={r.slug} value={r._count.id} max={topLandingsSorted[0]._count.id} unit="visitas" />
                  ))}
                </div>
              ) : (
                <EmptyChart label="Sin visitas registradas" />
              )}
            </div>
          </div>

          {/* De dónde llega la gente (Referrers) */}
          <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
              Orígenes de Tráfico (Referrers)
            </h2>
            {visitsByReferrerSorted.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {visitsByReferrerSorted.map(r => (
                  <Chip key={r.referrer} label={r.referrer} value={r._count.id} />
                ))}
              </div>
            ) : (
              <EmptyChart label="Sin datos de referidores" />
            )}
          </div>
        </div>
      </section>
      )}

      {/* ── SECCIÓN 3: DISTRIBUCIÓN AUTOMÁTICA Y CONTACTOS ── */}
      {distTotal === 0 && leadsTotal === 0 && nurtureTotal === 0 ? (
        <InactiveModule title="3. Distribución y contactos" description="No se registraron piezas, contactos ni envíos de nutrición durante el período." />
      ) : (
      <section className="flex flex-col gap-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate/50">3. Distribución Automática y Contactos</h2>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Piezas generadas" value={distTotal} />
          <StatCard label="Publicadas en redes" value={distPublished} sub={pct(distPublished, distTotal)} accent="moss" />
          <StatCard label="Contactos Totales" value={leadsTotal} />
          <StatCard label="Emails enviados" value={nurtureSent} sub={`${pct(nurtureSent, nurtureTotal)} de entrega`} accent="brass" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Publicadas por Red */}
          <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
              Posts propios publicados por red
            </h2>
            {distByCanalSorted.length > 0 ? (
              <div className="flex flex-col gap-2">
                {distByCanalSorted.map(r => (
                  <Bar key={r.canal}
                    label={CANAL_LABEL[r.canal] ?? r.canal}
                    value={r._count.id}
                    max={distByCanalSorted[0]._count.id}
                    unit="publicaciones"
                  />
                ))}
              </div>
            ) : (
              <EmptyChart label="Sin posts de distribución publicados aún" />
            )}
          </div>

          {/* Email nurture details */}
          <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur flex flex-col justify-between">
            <div>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
                Nutrición de Leads (Nurture Emails)
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-ink/10 bg-ink/3 p-3.5 text-center">
                  <p className="text-[10px] text-slate font-medium">Secuencias</p>
                  <p className="mt-1 font-display text-2xl font-bold text-ink">{nurtureTotal}</p>
                </div>
                <div className="rounded-lg border border-moss/20 bg-moss/5 p-3.5 text-center">
                  <p className="text-[10px] text-moss font-semibold">Enviados</p>
                  <p className="mt-1 font-display text-2xl font-bold text-moss">{nurtureSent}</p>
                </div>
                <div className="rounded-lg border border-signal/20 bg-signal/5 p-3.5 text-center">
                  <p className="text-[10px] text-signal font-semibold">Fallidos</p>
                  <p className="mt-1 font-display text-2xl font-bold text-signal">{nurtureFailed}</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate/60">
                El flujo de emails automatizados se activa cada vez que un lead se suscribe desde una landing page.
              </p>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ── SECCIÓN 4: PRESENCIA EN IAS (GEO) Y FUENTES DE MONITOREO ── */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* GEO Summary */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate/50">4. Presencia en Motores de IA</h2>
          <div className="rounded-xl border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <div className="flex items-center justify-between border-b border-ink/5 pb-3">
              <h3 className="text-sm font-bold text-ink">GEO (Generative Engine Optimization)</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                geoAvg._avg.score && geoAvg._avg.score >= 3
                  ? "bg-moss/10 text-moss"
                  : "bg-brass/10 text-brass"
              }`}>
                Score: {geoAvg._avg.score ? `${geoAvg._avg.score.toFixed(1)}/5` : "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-b border-ink/5">
              <div>
                <p className="text-xs text-slate">Consultas Evaluadas</p>
                <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{geoTotal}</p>
              </div>
              <div>
                <p className="text-xs text-slate">Mejor Calificación</p>
                <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{geoAvg._max.score !== null ? `${geoAvg._max.score}/5` : "—"}</p>
              </div>
            </div>

            {geoRecent.length > 0 ? (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-slate/75">Consultas recientes:</p>
                {geoRecent.map((g, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-lg border border-ink/5 bg-paper p-2.5 text-xs">
                    <span className={`font-bold tabular-nums shrink-0 ${
                      g.score >= 4 ? "text-moss" : g.score >= 2 ? "text-brass" : "text-signal"
                    }`}>
                      {g.score}/5
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate/80 italic truncate">&quot;{g.prompt}&quot;</p>
                      <p className="text-[10px] text-slate/50 mt-0.5">{g.modeloIA} · {fmtDate(g.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart label="Sin auditorías de IA recientes" />
            )}
          </div>
        </div>

      </section>
    </div>
  );
}

// ─── Lógica para Describir y Reparar Errores ─────────────────────────────────

function getErrorFix(event: string, message: string, meta: any): { title: string; explanation: string; action: string } {
  let metaObj: any = {};
  if (meta) {
    if (typeof meta === "string") {
      try {
        metaObj = JSON.parse(meta);
      } catch {
        metaObj = {};
      }
    } else {
      metaObj = meta;
    }
  }

  const msgLower = (message || "").toLowerCase();
  const metaMsg = (metaObj?.error?.message || "").toLowerCase();

  if (msgLower.includes("is not a valid model id") || metaMsg.includes("is not a valid model id")) {
    return {
      title: "Modelo de IA Inválido / Desactualizado",
      explanation: "El modelo configurado en OpenRouter (por ejemplo, `deepseek/deepseek-v4-flash`) no es válido o ha sido descontinuado por el proveedor.",
      action: "Revisá el archivo .env y cambiá la variable OPENROUTER_MODEL a un modelo activo válido (por ejemplo, google/gemini-2.5-flash o deepseek/deepseek-r1:free). Luego reiniciá el servidor."
    };
  }

  if (msgLower.includes("http 400") || msgLower.includes("bad request")) {
    return {
      title: "Error de Solicitud (Bad Request) en OpenRouter",
      explanation: "El portal OpenRouter rechazó la solicitud debido a un parámetro inválido o problemas con el modelo de IA configurado.",
      action: "Comprobá las variables de entorno en el archivo .env, especialmente OPENROUTER_MODEL y OPENROUTER_API_KEY. Asegurate de que el modelo exista en la lista oficial de OpenRouter y la API key tenga crédito."
    };
  }

  if (msgLower.includes("respuesta vacía") || msgLower.includes("empty response")) {
    return {
      title: "Respuesta Vacía del Proveedor de IA",
      explanation: "El proveedor de IA respondió correctamente pero el cuerpo del texto estaba vacío, posiblemente debido a límites de tokens o un bloqueo temporal.",
      action: "Reintentá generar el borrador de respuesta en unos minutos. Si el problema persiste, verificá si tu cuenta de OpenRouter tiene saldo o si el modelo está temporalmente congestionado."
    };
  }

  if (msgLower.includes("no se pudo parsear json") || msgLower.includes("json parse")) {
    return {
      title: "Fallo de Formato en Respuesta IA (JSON)",
      explanation: "El modelo de IA generó una respuesta pero no cumplió con el formato JSON estricto esperado por el sistema (por ejemplo, cortó el texto por la mitad o agregó comentarios extras).",
      action: "Hacé clic en 'Reintentar generación' en la oportunidad. El sistema volverá a solicitar el formato JSON correcto. Si ocurre con frecuencia, considerá usar un modelo más capaz (como Claude 3.5 Sonnet o GPT-4o)."
    };
  }

  if (event === "nurture_error" || msgLower.includes("nurture") || msgLower.includes("email") || msgLower.includes("mail")) {
    return {
      title: "Fallo en Envío de Email Automático",
      explanation: "Ocurrió un error al intentar despachar un correo electrónico automatizado de nutrición (nurture) para leads o contactos.",
      action: "Verificá la configuración del servidor de correo saliente (SMTP) o el servicio de email (ej. Resend, Sendgrid) en tu configuración de entorno. Asegurate de que el destinatario sea válido y la API key esté activa."
    };
  }

  if (msgLower.includes("dolphin") || msgLower.includes("browser") || msgLower.includes("cdp") || msgLower.includes("playwright") || msgLower.includes("nstbrowser")) {
    return {
      title: "Error de Navegador Automático / Scraping",
      explanation: "El agente de escucha (browser-cdp) no pudo interactuar con el navegador automatizado Dolphin o NSTBrowser local.",
      action: "Asegurate de que la aplicación Dolphin/NSTBrowser esté abierta localmente en tu PC en el puerto configurado o iniciá el navegador manualmente con 'python agents/browser-cdp.py start-browser --account <nombre-cuenta>'."
    };
  }

  return {
    title: `Error en evento: ${event}`,
    explanation: message || "No hay un mensaje detallado para este error.",
    action: "Revisá los detalles técnicos (meta) expandiendo el panel correspondiente para ver el código de error y el contexto técnico de la falla."
  };
}

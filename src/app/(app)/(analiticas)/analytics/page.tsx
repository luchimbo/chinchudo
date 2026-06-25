import { getAnalyticsData } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
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
    <div className="rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate/70">{label}</p>
      <p className={`mt-3 font-display text-4xl ${accentClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate/55">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur ${className}`}>
      <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-slate/70">{title}</h2>
      {children}
    </div>
  );
}

type PageProps = { searchParams: { client?: string } };

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === searchParams.client) ?? clients[0] ?? null;
  const data = await getAnalyticsData(activeClient?.id);

  const responseRate =
    data.totalOpportunities > 0
      ? Math.round((data.totalPublished / data.totalOpportunities) * 100)
      : 0;

  const conversionRate =
    data.totalPublished > 0
      ? Math.round((data.totalConverted / data.totalPublished) * 100)
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-5 py-8 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-moss">{activeClient?.name ?? "Todos los clientes"}</p>
        <h1 className="mt-3 font-display text-5xl leading-none text-ink md:text-7xl">Analítica</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate">
          Métricas operativas del sistema. Datos en tiempo real desde la base local.
        </p>
      </header>

      {/* KPI cards */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Oportunidades" value={data.totalOpportunities} />
        <StatCard label="Publicadas"    value={data.totalPublished}      accent="moss"   sub={`${responseRate}% tasa de publicación`} />
        <StatCard label="Convertidas"   value={data.totalConverted}      accent="brass"  sub={`${conversionRate}% de lo publicado`} />
        <StatCard label="Borradores IA" value={data.totalResponses}      accent="slate" />
      </section>

      {/* Gráficos: fila 1 */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Pipeline por estado">
          <PipelineChart data={data.statusCounts} />
        </ChartCard>
        <ChartCard title="Tendencia semanal (últimas 8 semanas)">
          <WeeklyTrendChart data={data.weeklyTrend} />
        </ChartCard>
      </section>

      {/* Gráficos: fila 2 */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
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
      </section>

      {/* Gráficos: fila 3 */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
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
      </section>

      {/* Productos + resultados */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Productos más consultados */}
        <div className="rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-slate/70">
            Productos más consultados
          </h2>
          {data.productCounts.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {data.productCounts.map((p, i) => (
                  <tr key={p.product} className="border-t border-ink/5 first:border-t-0">
                    <td className="py-2 pr-3 text-slate/50 tabular-nums">{i + 1}</td>
                    <td className="py-2 font-medium text-ink">{p.product}</td>
                    <td className="py-2 text-right font-bold text-slate tabular-nums">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* Resultados de publicación */}
        <ChartCard title="Resultados de publicación">
          {data.resultCounts.length > 0 ? (
            <ResultChart data={data.resultCounts} />
          ) : (
            <EmptyChart label="Sin publicaciones registradas aún" />
          )}
        </ChartCard>
      </section>

      {/* Resumen semanal IA */}
      <section className="mb-8">
        <WeeklySummary />
      </section>
    </div>
  );
}

function EmptyChart({ label = "Sin datos suficientes aún" }: { label?: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-ink/15">
      <p className="text-sm text-slate/40 italic">{label}</p>
    </div>
  );
}

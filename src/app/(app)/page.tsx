import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";

type PageProps = { searchParams: { client?: string } };

function Metric({ label, value, note, tone = "ink" }: { label: string; value: number; note: string; tone?: "ink" | "moss" | "brass" }) {
  const color = { ink: "text-ink", moss: "text-moss", brass: "text-brass" }[tone];
  return (
    <div className="rounded-xl border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">{label}</p>
      <p className={`mt-2 font-display text-4xl leading-none ${color}`}>{value}</p>
      <p className="mt-2 text-xs text-slate/65">{note}</p>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const clients = await getVisibleClients(prisma);
  const client = clients.find((item) => item.slug === searchParams.client) ?? clients[0] ?? null;
  const clientWhere = client ? { clientId: client.id } : {};
  const workStatuses = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;

  const [pending, published, converted, landings, leads, recent] = await Promise.all([
    prisma.opportunity.count({ where: { ...clientWhere, status: { in: [...workStatuses] } } }),
    prisma.opportunity.count({ where: { ...clientWhere, status: "PUBLISHED" } }),
    prisma.opportunity.count({ where: { ...clientWhere, status: "CONVERTED" } }),
    prisma.landing.count({ where: clientWhere }),
    prisma.lead.count({ where: clientWhere }),
    prisma.opportunity.findMany({
      where: clientWhere,
      select: { id: true, sourceText: true, sourceAuthor: true, status: true, channel: { select: { name: true } } },
      orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
      take: 4,
    }),
  ]);

  const withClient = (href: string) => client ? `${href}?client=${encodeURIComponent(client.slug)}` : href;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 lg:px-8">
      <header className="border-b border-ink/10 pb-7">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-moss">Centro de control · {client?.name ?? "Suite"}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate">La vista general para decidir qué atender, publicar y medir hoy.</p>
          </div>
          <Link href={withClient("/oportunidades")} className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-moss">
            Revisar oportunidades →
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Para atender" value={pending} note="Conversaciones activas" tone="brass" />
        <Metric label="Publicadas" value={published} note="Respuestas registradas" tone="moss" />
        <Metric label="Conversiones" value={converted} note="Resultados atribuidos" tone="moss" />
        <Metric label="Landings" value={landings} note="Piezas de contenido" />
        <Metric label="Leads" value={leads} note="Contactos captados" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white/75 shadow-panel">
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
            <div>
              <h2 className="font-display text-2xl text-ink">Prioridad de hoy</h2>
              <p className="mt-1 text-xs text-slate/65">Oportunidades con mayor señal comercial.</p>
            </div>
            <Link href={withClient("/oportunidades")} className="text-xs font-bold text-moss hover:text-ink">Ver todas</Link>
          </div>
          {recent.length ? (
            <div className="divide-y divide-ink/8">
              {recent.map((opportunity) => (
                <Link key={opportunity.id} href={withClient(`/opportunities/${opportunity.id}`)} className="block px-5 py-4 transition hover:bg-moss/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{opportunity.sourceAuthor || "Usuario de red"}</p>
                    <span className="rounded-full bg-ink/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate">{opportunity.channel.name}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate">{opportunity.sourceText}</p>
                </Link>
              ))}
            </div>
          ) : <p className="px-5 py-10 text-sm text-slate/65">Todavía no hay oportunidades para este cliente.</p>}
        </div>

        <aside className="rounded-xl border border-ink/10 bg-ink p-5 text-paper shadow-panel">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-paper/55">Atajos operativos</p>
          <div className="mt-4 flex flex-col gap-2">
            {[
              ["Publicador en redes", "/oportunidades"],
              ["Crear landing", "/landings/editor"],
              ["Tendencias y guiones", "/videos"],
              ["Analíticas detalladas", "/analytics"],
            ].map(([label, href]) => (
              <Link key={href} href={withClient(href)} className="flex items-center justify-between rounded-lg border border-paper/15 px-3 py-3 text-sm font-semibold transition hover:border-brass hover:bg-paper/10">
                {label}<span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, getVisibleClients } from "@/lib/auth";

const OPEN_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;
const RESPONDED_STATUSES = ["PUBLISHED", "CONVERTED"] as const;

type PageProps = { searchParams: { client?: string } };

export default async function HomePage({ searchParams }: PageProps) {
  const [clients, currentUser] = await Promise.all([
    getVisibleClients(prisma),
    getCurrentUser(),
  ]);
  const activeClient = clients.find((c) => c.slug === searchParams.client) ?? clients[0] ?? null;

  const clientWhere: Prisma.OpportunityWhereInput | undefined = activeClient
    ? { OR: [{ detectedBrand: { clientId: activeClient.id } }, { monitoredSource: { clientId: activeClient.id } }] }
    : undefined;

  const [oportunidadesCount, sinBorradorCount, historialCount] = await Promise.all([
    prisma.opportunity.count({
      where: { ...clientWhere, status: { in: [...OPEN_STATUSES] }, responses: { some: {} } },
    }),
    prisma.opportunity.count({
      where: { ...clientWhere, status: { in: [...OPEN_STATUSES] }, responses: { none: {} } },
    }),
    prisma.opportunity.count({
      where: { ...clientWhere, status: { in: [...RESPONDED_STATUSES] } },
    }),
  ]);

  const clientQuery = activeClient ? `?client=${encodeURIComponent(activeClient.slug)}` : "";
  const hoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long" });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center px-5 py-10 lg:px-8">
      <header className="mb-8">
        <p className="text-sm text-slate/70">
          {currentUser ? `Hola, ${currentUser.label}` : "Hola"}
          {activeClient ? <> · <span className="font-semibold text-ink">{activeClient.name}</span></> : null}
          {" · "}{hoy}
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2">
        {/* Oportunidades */}
        <Link
          href={`/oportunidades${clientQuery}`}
          className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border border-ink/10 bg-white/80 p-7 shadow-panel backdrop-blur transition hover:-translate-y-1 hover:border-ink/30 hover:bg-white"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-signal">Para responder</p>
            <span className="rounded-full border border-ink/15 px-3 py-1 text-xs font-bold text-ink transition group-hover:bg-ink group-hover:text-paper">
              Entrar →
            </span>
          </div>
          <div>
            <p className="font-display text-7xl leading-none text-ink">{oportunidadesCount}</p>
            <h2 className="mt-3 font-display text-3xl text-ink">Oportunidades</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Borradores listos para revisar y publicar.
              {sinBorradorCount > 0 ? ` (${sinBorradorCount} sin borrador todavía)` : ""}
            </p>
          </div>
        </Link>

        {/* Historial */}
        <Link
          href={`/historial${clientQuery}`}
          className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border border-ink/10 bg-white/80 p-7 shadow-panel backdrop-blur transition hover:-translate-y-1 hover:border-moss/40 hover:bg-white"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-moss">Ya respondido</p>
            <span className="rounded-full border border-ink/15 px-3 py-1 text-xs font-bold text-ink transition group-hover:bg-moss group-hover:text-paper">
              Entrar →
            </span>
          </div>
          <div>
            <p className="font-display text-7xl leading-none text-moss">{historialCount}</p>
            <h2 className="mt-3 font-display text-3xl text-ink">Historial</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Todo lo que ya fue respondido y publicado.
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
}

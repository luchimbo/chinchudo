import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FilterBar } from "@/components/filter-bar";
import { OpportunityList } from "@/components/opportunity-list";
import { getVisibleClients } from "@/lib/auth";

const PAGE_SIZE = 12;

// "Oportunidades" = tienen al menos un borrador de respuesta generado y siguen abiertas
// (no publicadas / convertidas / descartadas). Es el trabajo del día.
const OPEN_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;

type PageProps = {
  searchParams: { channel?: string; q?: string; page?: string; client?: string };
};

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const [channelsList, clients] = await Promise.all([
    prisma.channel.findMany({ orderBy: { name: "asc" } }),
    getVisibleClients(prisma),
  ]);
  const activeClient = clients.find((c) => c.slug === searchParams.client) ?? clients[0] ?? null;

  const validChannel = channelsList.find((c) => c.name === searchParams.channel)?.name ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Prisma.OpportunityWhereInput = {
    status: { in: [...OPEN_STATUSES] },
    responses: { some: {} },
  };
  if (activeClient) {
    where.clientId = activeClient.id;
  }
  if (validChannel) where.channel = { name: validChannel };
  if (q) {
    where.AND = [{ OR: [{ sourceText: { contains: q } }, { sourceAuthor: { contains: q } }] }];
  }

  const [opportunities, matchingCount] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        channel: true,
        detectedBrand: true,
        detectedProduct: true,
        _count: { select: { responses: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.opportunity.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (activeClient) params.set("client", activeClient.slug);
    if (validChannel) params.set("channel", validChannel);
    if (q) params.set("q", q);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/oportunidades?${qs}` : "/oportunidades";
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Oportunidades</h1>
          <p className="mt-2 text-sm text-slate">
            Conversaciones con borrador listo para revisar, aprobar y publicar.
          </p>
        </div>
        <Link
          href={activeClient ? `/opportunities/new?client=${activeClient.slug}` : "/opportunities/new"}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-slate"
        >
          Nueva oportunidad
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white/75 shadow-panel backdrop-blur">
        <div className="border-b border-ink/10 px-5 py-4">
          <p className="text-sm text-slate/75">
            {matchingCount} {matchingCount === 1 ? "oportunidad" : "oportunidades"}
            {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
          </p>
        </div>

        <FilterBar channels={channelsList.map((c) => c.name)} />

        <OpportunityList
          opportunities={opportunities}
          clientSlug={activeClient?.slug}
          emptyMessage="No hay oportunidades con borrador todavía."
        />

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-ink/10 px-5 py-4">
            {page > 1 ? (
              <Link href={buildPageHref(page - 1)} className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper">
                ← Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-full border border-ink/5 px-4 text-sm font-bold text-ink/30">← Anterior</span>
            )}
            <span className="text-xs font-semibold text-slate/70">Página {page} de {totalPages}</span>
            {page < totalPages ? (
              <Link href={buildPageHref(page + 1)} className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper">
                Siguiente →
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-full border border-ink/5 px-4 text-sm font-bold text-ink/30">Siguiente →</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

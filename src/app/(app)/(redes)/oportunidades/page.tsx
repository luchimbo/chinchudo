import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FilterBar } from "@/components/filter-bar";
import { ManualOpportunitySearch } from "@/components/manual-opportunity-search";
import { OpportunityList } from "@/components/opportunity-list";
import { getVisibleClients } from "@/lib/auth";
import { opportunityStatuses } from "@/lib/labels";

const PAGE_SIZE = 12;

// "Oportunidades" = tienen al menos un borrador de respuesta generado y siguen abiertas
// (no publicadas / convertidas / descartadas). Es el trabajo del día.
const OPEN_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;

type PageProps = {
  searchParams: { channel?: string; q?: string; page?: string; client?: string; sort?: string; status?: string; brand?: string };
};

function parseKeywords(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function canonicalOpportunityUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return sourceUrl.replace(/#.*$/, "").trim().toLowerCase();
  }
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const [channelsList, clients] = await Promise.all([
    prisma.channel.findMany({ orderBy: { name: "asc" } }),
    getVisibleClients(prisma),
  ]);
  const activeClient = clients.find((c) => c.slug === searchParams.client) ?? clients[0] ?? null;
  const brandsList = activeClient
    ? await prisma.brand.findMany({ where: { clientId: activeClient.id }, orderBy: { name: "asc" } })
    : [];

  const validChannel = channelsList.find((c) => c.name === searchParams.channel)?.name ?? "";
  const validBrand = brandsList.find((b) => b.name === searchParams.brand)?.name ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const sort = searchParams.sort === "oldest" ? "oldest" : "newest";
  const validStatus = opportunityStatuses.includes(searchParams.status as any)
    ? searchParams.status
    : "";

  const where: Prisma.OpportunityWhereInput = {
    status: { in: [...OPEN_STATUSES] },
    responses: { some: {} },
  };
  if (validStatus) where.status = validStatus as any;
  if (activeClient) {
    where.clientId = activeClient.id;
  }
  if (validChannel) where.channel = { name: validChannel };
  if (validBrand) where.detectedBrand = { name: validBrand };
  if (q) {
    where.AND = [{ OR: [{ sourceText: { contains: q } }, { sourceAuthor: { contains: q } }] }];
  }

  // El selector de orden debe respetar la fecha de forma estricta. La prioridad
  // comercial se muestra en el dashboard, pero no puede intercalar registros
  // viejos cuando la persona eligió “Más nuevos primero”.
  const orderBy: Prisma.OpportunityOrderByWithRelationInput =
    sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

  const scopedClientWhere: Prisma.OpportunityWhereInput = activeClient ? { clientId: activeClient.id } : {};
  const [matchingOpportunities, readyCount, products] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        channel: true,
      },
      orderBy,
    }),
    prisma.opportunity.count({
      where: {
        ...scopedClientWhere,
        status: { in: [...OPEN_STATUSES] },
        responses: { some: {} },
      },
    }),
    activeClient
      ? prisma.product.findMany({
          where: { brand: { clientId: activeClient.id } },
          select: { name: true, category: true, brand: { select: { name: true } } },
          take: 8,
        })
      : Promise.resolve([]),
  ]);
  // Un post puede llegar desde el extractor como enlace base y como `#comment-*`.
  // Mostramos una única tarjeta y priorizamos la que conserva autor/borradores.
  const uniqueOpportunities = Array.from(
    matchingOpportunities.reduce((byUrl, opportunity) => {
      const key = canonicalOpportunityUrl(opportunity.sourceUrl);
      const current = byUrl.get(key);
      const currentScore = current?.sourceAuthor ? 1 : 0;
      const nextScore = opportunity.sourceAuthor ? 1 : 0;
      if (!current || nextScore > currentScore) byUrl.set(key, opportunity);
      return byUrl;
    }, new Map<string, (typeof matchingOpportunities)[number]>()).values(),
  );
  const matchingCount = uniqueOpportunities.length;
  const opportunities = uniqueOpportunities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const keywordSuggestions = [
    ...parseKeywords(activeClient?.domainKeywords).slice(0, 6),
    ...products.map((p) => `${p.brand.name} ${p.name}`),
  ].filter(Boolean);
  const initialQuery = keywordSuggestions.slice(0, 3).join(" ") || "MidiPlus controlador MIDI";
  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const currentParams = () => {
    const params = new URLSearchParams();
    if (activeClient) params.set("client", activeClient.slug);
    if (validChannel) params.set("channel", validChannel);
    if (validBrand) params.set("brand", validBrand);
    if (q) params.set("q", q);
    if (sort === "oldest") params.set("sort", "oldest");
    if (validStatus) params.set("status", validStatus);
    return params;
  };
  const buildPageHref = (targetPage: number) => {
    const params = currentParams();
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/oportunidades?${qs}` : "/oportunidades";
  };
  const exportHref = `/api/opportunities/export?${currentParams().toString()}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6 flex items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Oportunidades</h1>
          <p className="mt-2 text-sm text-slate">
            Conversaciones con borrador listo para revisar, aprobar y publicar.
          </p>
        </div>
        <Link
          href={activeClient ? `/oportunidades?client=${activeClient.slug}` : "/oportunidades"}
          className="shrink-0 pt-1 text-right text-slate transition hover:text-ink"
          aria-label={`${readyCount} listas para revisar`}
        >
          <span className="block text-xs font-bold uppercase tracking-[0.12em] text-slate/60">Para revisar</span>
          <span className="mt-0.5 block text-xl font-bold leading-none text-ink">{readyCount}</span>
        </Link>
      </header>

      {activeClient ? (
        <ManualOpportunitySearch
          clientId={activeClient.id}
          initialQuery={initialQuery}
          suggestions={keywordSuggestions}
        />
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-ink/10 bg-white/75 p-4 shadow-panel backdrop-blur lg:sticky lg:top-5">
          <FilterBar
            channels={channelsList.map((c) => c.name)}
            brands={brandsList.map((b) => b.name)}
            variant="sidebar"
          />
        </aside>

        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white/75 shadow-panel backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <p className="text-sm text-slate/75">
            {matchingCount} {matchingCount === 1 ? "oportunidad" : "oportunidades"}
            {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
          </p>
          <a
            href={exportHref}
            download
            className="inline-flex h-8 items-center rounded-full border border-ink/15 px-3 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
          >
            Exportar CSV
          </a>
        </div>

        <OpportunityList
          opportunities={opportunities}
          clientSlug={activeClient?.slug}
          emptyMessage="No hay oportunidades con borrador todavia."
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
    </div>
  );
}

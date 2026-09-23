import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FilterBar } from "@/components/filter-bar";
import { requirePageClient } from "@/lib/auth";
import { OPPORTUNITY_CHANNEL_NAMES, operationalOpportunityWhere } from "@/lib/opportunity-channels";
import { formatAuthor } from "@/lib/source-author";
import { splitOpportunitySourcePreview } from "@/lib/opportunity-source-metadata";
import { SentResponses, type SentResponseItem } from "./sent-responses";

const PAGE_SIZE = 20;

function copilotRespondedAt(context: Prisma.JsonValue): string | undefined {
  if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;
  const copilot = (context as Record<string, unknown>).copilot;
  if (!copilot || typeof copilot !== "object" || Array.isArray(copilot)) return undefined;
  const { respondedAt } = copilot as Record<string, unknown>;
  return typeof respondedAt === "string" ? respondedAt : undefined;
}

// "Historial" conserva respuestas archivadas y publicaciones confirmadas.
const RESPONDED_STATUSES = ["ARCHIVED", "PUBLISHED", "FOLLOW_UP", "CONVERTED"] as const;

type PageProps = {
  searchParams: { channel?: string; q?: string; page?: string; client?: string; sort?: string };
};

export default async function HistorialPage({ searchParams }: PageProps) {
  const [channelsList, activeClient] = await Promise.all([
    prisma.channel.findMany({
      where: { name: { in: [...OPPORTUNITY_CHANNEL_NAMES] } },
      orderBy: { name: "asc" },
    }),
    requirePageClient(prisma, searchParams.client),
  ]);

  const validChannel = channelsList.find((c) => c.name === searchParams.channel)?.name ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const sort = searchParams.sort === "oldest" ? "oldest" : "newest";

  const where: Prisma.OpportunityWhereInput = {
    ...operationalOpportunityWhere(),
    status: { in: [...RESPONDED_STATUSES] },
  };
  if (activeClient) {
    where.clientId = activeClient.id;
  }
  if (validChannel) where.channel = { name: validChannel };
  if (q) {
    // También busca dentro de lo que respondiste, para encontrar una respuesta vieja por su texto.
    const contains = { contains: q, mode: "insensitive" as const };
    where.AND = [{
      OR: [
        { sourceText: contains },
        { sourceAuthor: contains },
        { responses: { some: { isPrimary: true, OR: [{ editedText: contains }, { draftText: contains }] } } },
      ],
    }];
  }

  const orderBy: Prisma.OpportunityOrderByWithRelationInput =
    sort === "oldest" ? { updatedAt: "asc" } : { updatedAt: "desc" };

  const [opportunities, matchingCount] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        channel: true,
        publishingLogs: { select: { responseId: true, publishedAt: true, publishedUrl: true }, orderBy: { publishedAt: "desc" } },
        responses: {
          where: { isPrimary: true },
          select: { id: true, draftText: true, editedText: true },
          take: 1,
        },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.opportunity.count({ where }),
  ]);

  const items: SentResponseItem[] = opportunities.map((opportunity) => {
    const response = opportunity.responses[0];
    const log = opportunity.publishingLogs.find((entry) => entry.responseId === response?.id) ?? opportunity.publishingLogs[0];
    return {
      opportunityId: opportunity.id,
      channel: opportunity.channel.name,
      sourceAuthor: formatAuthor(opportunity.sourceAuthor, opportunity.channel.name, opportunity.sourceUrl)?.name ?? "",
      sourceText: splitOpportunitySourcePreview(opportunity.sourceText).text,
      sourceUrl: opportunity.sourceUrl,
      commentUrl: log?.publishedUrl && log.publishedUrl !== opportunity.sourceUrl ? log.publishedUrl : "",
      respondedAt: copilotRespondedAt(opportunity.contextAssessment) ?? log?.publishedAt.toISOString() ?? opportunity.updatedAt.toISOString(),
      responseText: response ? response.editedText || response.draftText : "",
    };
  });

  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (activeClient) params.set("client", activeClient.slug);
    if (validChannel) params.set("channel", validChannel);
    if (q) params.set("q", q);
    if (sort === "oldest") params.set("sort", "oldest");
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/historial?${qs}` : "/historial";
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Historial</h1>
        <p className="mt-2 text-sm text-slate">Cada comentario que enviaste, junto al post al que respondiste.</p>
      </header>

      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white/75 shadow-panel backdrop-blur">
        <div className="border-b border-ink/10 px-5 py-4">
          <p className="text-sm text-slate/75">
            {matchingCount} {matchingCount === 1 ? "respondida" : "respondidas"}
            {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
          </p>
        </div>

        <FilterBar channels={channelsList.map((c) => c.name)} />

        <SentResponses
          items={items}
          emptyMessage={q || validChannel ? "No hay respuestas que coincidan con la búsqueda." : "Todavía no hay conversaciones respondidas."}
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

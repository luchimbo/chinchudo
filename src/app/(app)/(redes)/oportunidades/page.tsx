import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FilterBar } from "@/components/filter-bar";
import { ManualOpportunitySearch } from "@/components/manual-opportunity-search";
import { OpportunityList } from "@/components/opportunity-list";
import { getVisibleClients } from "@/lib/auth";
import { opportunityStatuses } from "@/lib/labels";
import { suggestAllPersonasForClient } from "@/lib/persona-router";

const PAGE_SIZE = 12;

// "Oportunidades" = tienen al menos un borrador de respuesta generado y siguen abiertas
// (no publicadas / convertidas / descartadas). Es el trabajo del día.
const OPEN_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;

type PageProps = {
  searchParams: { channel?: string; q?: string; page?: string; client?: string; sort?: string; status?: string; view?: string };
};

function parseKeywords(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const [channelsList, clients] = await Promise.all([
    prisma.channel.findMany({ orderBy: { name: "asc" } }),
    getVisibleClients(prisma),
  ]);
  const activeClient = clients.find((c) => c.slug === searchParams.client) ?? clients[0] ?? null;

  const validChannel = channelsList.find((c) => c.name === searchParams.channel)?.name ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const sort = searchParams.sort === "oldest" ? "oldest" : "newest";
  const view = searchParams.view === "inbox" ? "inbox" : "ready";
  const validStatus = opportunityStatuses.includes(searchParams.status as any)
    ? searchParams.status
    : "";

  const where: Prisma.OpportunityWhereInput = {
    status: { in: [...OPEN_STATUSES] },
    responses: view === "inbox" ? { none: {} } : { some: {} },
  };
  if (validStatus) where.status = validStatus as any;
  if (activeClient) {
    where.clientId = activeClient.id;
  }
  if (validChannel) where.channel = { name: validChannel };
  if (q) {
    where.AND = [{ OR: [{ sourceText: { contains: q } }, { sourceAuthor: { contains: q } }] }];
  }

  const orderBy: Prisma.OpportunityOrderByWithRelationInput =
    sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

  const scopedClientWhere: Prisma.OpportunityWhereInput = activeClient ? { clientId: activeClient.id } : {};
  const [opportunities, matchingCount, readyCount, inboxCount, missingClientCount, products] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        channel: true,
        detectedBrand: true,
        detectedProduct: true,
        observedProfile: true,
        observedEvent: true,
        responses: {
          select: {
            id: true,
            voiceVariant: true,
            persona: { select: { name: true } },
          },
        },
        _count: { select: { responses: true } },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.opportunity.count({ where }),
    prisma.opportunity.count({
      where: {
        ...scopedClientWhere,
        status: { in: [...OPEN_STATUSES] },
        responses: { some: {} },
      },
    }),
    prisma.opportunity.count({
      where: {
        ...scopedClientWhere,
        status: { in: ["NEW", "NEEDS_REVIEW"] },
        responses: { none: {} },
      },
    }),
    prisma.opportunity.count({
      where: {
        clientId: null,
        status: { in: ["NEW", "NEEDS_REVIEW"] },
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
  const keywordSuggestions = [
    ...parseKeywords(activeClient?.domainKeywords).slice(0, 6),
    ...products.map((p) => `${p.brand.name} ${p.name}`),
  ].filter(Boolean);
  const initialQuery = keywordSuggestions.slice(0, 3).join(" ") || "MidiPlus controlador MIDI";
  const recommendationEntries = await Promise.all(opportunities.map(async (opportunity) => {
    const clientId = activeClient?.id ?? opportunity.clientId;
    if (!clientId) return [opportunity.id, undefined] as const;
    const observedProfileContext = opportunity.observedProfile && opportunity.observedEvent
      ? {
          currentTopic: opportunity.observedEvent.primaryTopicKey,
          currentTopicConfidence: opportunity.observedEvent.topicConfidence as "high" | "medium" | "low",
          historicalPrimaryTopics: Array.isArray(opportunity.observedProfile.primaryTopics) ? opportunity.observedProfile.primaryTopics as string[] : [],
          historicalSecondaryTopics: Array.isArray(opportunity.observedProfile.secondaryTopics) ? opportunity.observedProfile.secondaryTopics as string[] : [],
          toneProfile: (opportunity.observedProfile.toneSummary || "mixed") as "casual" | "technical" | "formal" | "aspirational" | "direct" | "mixed",
          toneConfidence: (opportunity.observedProfile.toneConfidence || "low") as "high" | "medium" | "low",
          commercialReadiness: opportunity.observedProfile.commercialReadiness,
          signalSummary: opportunity.observedEvent.signalSummary,
        }
      : null;
    const suggestions = await suggestAllPersonasForClient(prisma, opportunity, clientId, observedProfileContext);
    const suggestion = suggestions[0];
    const hasAlignedDraft = !!opportunity.responses.find((response) => response.voiceVariant && response.voiceVariant === suggestion?.voiceVariant);
    const clarity: "high" | "medium" | "low" = suggestion?.score && suggestion.score >= 8
      ? "high"
      : suggestion?.score && suggestion.score >= 4
        ? "medium"
        : "low";
    return [opportunity.id, suggestion ? {
      personaName: suggestion.personaName,
      voiceVariant: suggestion.voiceVariant,
      clarity,
      reason: suggestion.voiceVariantReason || suggestion.reason,
      hasAlignedDraft,
    } : undefined] as const;
  }));
  const recommendationMetaById: Record<string, {
    personaName: string;
    voiceVariant?: string;
    clarity: "high" | "medium" | "low";
    reason: string;
    hasAlignedDraft?: boolean;
  }> = {};
  for (const [opportunityId, recommendation] of recommendationEntries) {
    if (recommendation) recommendationMetaById[opportunityId] = recommendation;
  }

  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (activeClient) params.set("client", activeClient.slug);
    if (validChannel) params.set("channel", validChannel);
    if (q) params.set("q", q);
    if (sort === "oldest") params.set("sort", "oldest");
    if (view === "inbox") params.set("view", "inbox");
    if (validStatus) params.set("status", validStatus);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/oportunidades?${qs}` : "/oportunidades";
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Oportunidades</h1>
          <p className="mt-2 text-sm text-slate">
            Conversaciones con borrador listo para revisar, aprobar y publicar.
          </p>
        </div>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        <Link
          href={activeClient ? `/oportunidades?client=${activeClient.slug}` : "/oportunidades"}
          className={`rounded-lg border px-4 py-3 transition ${view === "ready" ? "border-ink/25 bg-white text-ink shadow-panel" : "border-ink/10 bg-white/55 text-slate hover:bg-white"}`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate/60">Listas para revisar</p>
          <p className="mt-1 text-2xl font-bold">{readyCount}</p>
          <p className="text-xs font-medium text-slate/70">con borrador listo</p>
        </Link>
        <Link
          href={activeClient ? `/oportunidades?client=${activeClient.slug}&view=inbox` : "/oportunidades?view=inbox"}
          className={`rounded-lg border px-4 py-3 transition ${view === "inbox" ? "border-ink/25 bg-white text-ink shadow-panel" : "border-ink/10 bg-white/55 text-slate hover:bg-white"}`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate/60">Entrada cruda</p>
          <p className="mt-1 text-2xl font-bold">{inboxCount}</p>
          <p className="text-xs font-medium text-slate/70">sin borrador todavia</p>
        </Link>
        <div className="rounded-lg border border-ink/10 bg-white/55 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate/60">Sin cliente</p>
          <p className="mt-1 text-2xl font-bold">{missingClientCount}</p>
          <p className="text-xs font-medium text-slate/70">pendientes de asignar</p>
        </div>
      </section>

      {activeClient ? (
        <ManualOpportunitySearch
          clientId={activeClient.id}
          initialQuery={initialQuery}
          suggestions={keywordSuggestions}
        />
      ) : null}

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
          recommendationMetaById={recommendationMetaById}
          clientSlug={activeClient?.slug}
          emptyMessage={view === "inbox" ? "No hay oportunidades crudas pendientes." : "No hay oportunidades con borrador todavia."}
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

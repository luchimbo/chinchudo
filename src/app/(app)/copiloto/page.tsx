import { OpportunityStatus, Prisma } from "@prisma/client";
import { requirePageClient } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OPPORTUNITY_CHANNEL_NAMES, operationalOpportunityWhere } from "@/lib/opportunity-channels";
import type { ChatMessage } from "@/lib/refine-draft";
import { CopilotWorkspace } from "./workspace";
import { loadCMCoverage, CM_ACTIVE_STATUSES } from "@/lib/cm-maintenance";
import { cmIsFresh } from "@/lib/cm-freshness";

const COPILOT_OPEN_STATUSES: OpportunityStatus[] = [...CM_ACTIVE_STATUSES];

function parseChatHistory(value: Prisma.JsonValue): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { sender, text, suggestion } = item as Record<string, unknown>;
    if ((sender !== "user" && sender !== "assistant") || typeof text !== "string") return [];
    // La propuesta editable del chat se conserva solo si tiene la forma esperada.
    const proposal = suggestion && typeof suggestion === "object" ? suggestion as Record<string, unknown> : null;
    return [{
      sender,
      text,
      ...(proposal && typeof proposal.text === "string" && typeof proposal.original === "string"
        ? { suggestion: { text: proposal.text, original: proposal.original } }
        : {}),
    }];
  });
}
type PageProps = {
  searchParams: { client?: string; brand?: string; channel?: string; response?: string; sort?: string };
};

export default async function CopilotoPage({ searchParams }: PageProps) {
  const [activeClient, channels] = await Promise.all([
    requirePageClient(prisma, searchParams.client),
    prisma.channel.findMany({
      where: { name: { in: [...OPPORTUNITY_CHANNEL_NAMES] } },
      orderBy: { name: "asc" },
    }),
  ]);
  const [brands, coverage] = await Promise.all([
    prisma.brand.findMany({ where: { clientId: activeClient.id }, orderBy: { name: "asc" } }),
    loadCMCoverage(prisma, activeClient.id),
  ]);
  const coverageById = new Map(coverage.rows.map((row) => [row.id, row]));
  const selectedBrand = brands.find((brand) => brand.id === searchParams.brand)?.id;
  const selectedChannel = channels.find((channel) => channel.id === searchParams.channel)?.id;
  const selectedResponse = ["generated", "missing", "stale", "fresh", "review", "error"].includes(searchParams.response ?? "") ? searchParams.response! : "";
  const selectedSort = searchParams.sort === "newest" || searchParams.sort === "oldest" ? searchParams.sort : "";
  const orderBy: Prisma.OpportunityOrderByWithRelationInput[] = selectedSort === "newest"
    ? [{ createdAt: "desc" }]
    : selectedSort === "oldest"
      ? [{ createdAt: "asc" }]
      : [{ opportunityScore: "desc" }, { createdAt: "desc" }];

  const where: Prisma.OpportunityWhereInput = {
    ...operationalOpportunityWhere(),
    clientId: activeClient?.id,
    status: { in: COPILOT_OPEN_STATUSES },
    publishingLogs: { none: {} },
    ...(selectedBrand ? { detectedBrandId: selectedBrand } : {}),
    ...(selectedChannel ? { channelId: selectedChannel } : {}),
    ...(selectedResponse === "generated" ? { responses: { some: {} } } : selectedResponse
      ? { id: { in: coverage.rows.filter((row) => row.status === selectedResponse).map((row) => row.id) } } : {}),
  };

  const [opportunities, youtubeConnection, products] = await Promise.all([
    activeClient
      ? prisma.opportunity.findMany({
          where,
          include: {
            channel: true,
            detectedBrand: true,
            detectedProduct: true,
            responses: { include: { persona: true }, orderBy: { createdAt: "desc" } },
          },
          orderBy,
          take: 60,
        })
      : Promise.resolve([]),
    activeClient
      ? prisma.youTubeConnection.findFirst({ where: { clientId: activeClient.id }, orderBy: { updatedAt: "desc" }, select: { account: true, channelTitle: true } })
      : Promise.resolve(null),
    activeClient
      ? prisma.product.findMany({
          where: { brand: { clientId: activeClient.id } },
          select: { id: true, name: true, brand: { select: { name: true } } },
          orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  return (
    <CopilotWorkspace
      activeClient={activeClient ? { slug: activeClient.slug, name: activeClient.name } : null}
      coverage={coverage.counts}
      youtube={activeClient ? {
        account: youtubeConnection?.account ?? "youtube-principal",
        connected: Boolean(youtubeConnection),
        channelTitle: youtubeConnection?.channelTitle ?? "",
      } : null}
      filters={{ brands: brands.map((brand) => ({ id: brand.id, name: brand.name })), channels: channels.map((channel) => ({ id: channel.id, name: channel.name })), selectedBrand: selectedBrand ?? "", selectedChannel: selectedChannel ?? "", selectedResponse, selectedSort }}
      products={products.map((product) => ({ id: product.id, name: product.name, brand: product.brand.name }))}
      opportunities={opportunities.map((opportunity) => ({
        id: opportunity.id,
        text: opportunity.sourceText,
        title: opportunity.sourceTitle,
        notes: opportunity.notes,
        author: opportunity.sourceAuthor,
        sourceUrl: opportunity.sourceUrl,
        channel: opportunity.channel.name,
        brand: opportunity.detectedBrand?.name ?? "Marca por definir",
        product: opportunity.detectedProduct?.name ?? "",
        productId: opportunity.detectedProductId ?? "",
        createdAt: opportunity.createdAt.toISOString(),
        status: opportunity.status,
        freshness: coverageById.get(opportunity.id)?.status ?? "missing",
        refreshError: coverageById.get(opportunity.id)?.error ?? "",
        hasDrafts: opportunity.responses.length > 0,
        responses: opportunity.responses.map((response) => ({
          id: response.id,
          text: response.editedText || response.draftText,
          variantType: response.variantType,
          isPrimary: response.isPrimary,
          persona: response.persona.name,
          acceptedAsCorrect: Boolean(response.acceptedAsCorrectAt),
          fresh: cmIsFresh(response.evidence, coverage.version, opportunity),
          chatHistory: parseChatHistory(response.chatHistory),
        })),
      }))}
    />
  );
}

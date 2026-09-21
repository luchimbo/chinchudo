import { OpportunityStatus, Prisma } from "@prisma/client";
import { requirePageClient } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OPPORTUNITY_CHANNEL_NAMES, operationalOpportunityWhere } from "@/lib/opportunity-channels";
import { CopilotWorkspace } from "./workspace";

const COPILOT_OPEN_STATUSES: OpportunityStatus[] = ["NEW", "NEEDS_REVIEW", "DRAFTED"];

function parseChatHistory(value: Prisma.JsonValue): { sender: "user" | "assistant"; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { sender, text } = item as Record<string, unknown>;
    return (sender === "user" || sender === "assistant") && typeof text === "string" ? [{ sender, text }] : [];
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
  const brands = await prisma.brand.findMany({ where: { clientId: activeClient.id }, orderBy: { name: "asc" } });
  const selectedBrand = brands.find((brand) => brand.id === searchParams.brand)?.id;
  const selectedChannel = channels.find((channel) => channel.id === searchParams.channel)?.id;
  const selectedResponse = searchParams.response === "generated" ? "generated" : "";
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
    ...(selectedBrand ? { detectedBrandId: selectedBrand } : {}),
    ...(selectedChannel ? { channelId: selectedChannel } : {}),
    ...(selectedResponse ? { responses: { some: {} } } : {}),
  };

  const [opportunities, youtubeConnection] = await Promise.all([
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
      ? prisma.youTubeConnection.findFirst({ where: { clientId: activeClient.id }, select: { account: true, channelTitle: true } })
      : Promise.resolve(null),
  ]);
  return (
    <CopilotWorkspace
      activeClient={activeClient ? { slug: activeClient.slug, name: activeClient.name } : null}
      youtube={activeClient ? {
        account: youtubeConnection?.account ?? "youtube-principal",
        connected: Boolean(youtubeConnection),
        channelTitle: youtubeConnection?.channelTitle ?? "",
      } : null}
      filters={{ brands: brands.map((brand) => ({ id: brand.id, name: brand.name })), channels: channels.map((channel) => ({ id: channel.id, name: channel.name })), selectedBrand: selectedBrand ?? "", selectedChannel: selectedChannel ?? "", selectedResponse, selectedSort }}
      opportunities={opportunities.map((opportunity) => ({
        id: opportunity.id,
        text: opportunity.sourceText,
        notes: opportunity.notes,
        author: opportunity.sourceAuthor,
        sourceUrl: opportunity.sourceUrl,
        channel: opportunity.channel.name,
        brand: opportunity.detectedBrand?.name ?? "Marca por definir",
        product: opportunity.detectedProduct?.name ?? "",
        createdAt: opportunity.createdAt.toISOString(),
        status: opportunity.status,
        hasDrafts: opportunity.responses.length > 0,
        responses: opportunity.responses.map((response) => ({
          id: response.id,
          text: response.editedText || response.draftText,
          variantType: response.variantType,
          isPrimary: response.isPrimary,
          persona: response.persona.name,
          acceptedAsCorrect: Boolean(response.acceptedAsCorrectAt),
          chatHistory: parseChatHistory(response.chatHistory),
        })),
      }))}
    />
  );
}

import { OpportunityStatus, Prisma } from "@prisma/client";
import { getVisibleClients } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { selectCopilotPulse } from "@/lib/radar-editorial";
import { CopilotWorkspace } from "./workspace";

const COPILOT_OPEN_STATUSES: OpportunityStatus[] = ["NEW", "NEEDS_REVIEW", "DRAFTED"];
type PageProps = {
  searchParams: { client?: string; view?: string; brand?: string; channel?: string; response?: string; sort?: string };
};

export default async function CopilotoPage({ searchParams }: PageProps) {
  const [clients, channels] = await Promise.all([
    getVisibleClients(prisma),
    prisma.channel.findMany({ orderBy: { name: "asc" } }),
  ]);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const activeView = searchParams.view === "pulse" ? "pulse" : "opportunities";
  const brands = activeClient
    ? await prisma.brand.findMany({ where: { clientId: activeClient.id }, orderBy: { name: "asc" } })
    : [];
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
    clientId: activeClient?.id,
    status: { in: COPILOT_OPEN_STATUSES },
    ...(selectedBrand ? { detectedBrandId: selectedBrand } : {}),
    ...(selectedChannel ? { channelId: selectedChannel } : {}),
    ...(selectedResponse ? { responses: { some: {} } } : {}),
  };

  const [opportunities, pulse, twitterConversations] = await Promise.all([
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
      ? prisma.trend.findMany({
          where: {
            clientId: activeClient.id,
            platform: { in: ["GOOGLE_TRENDS", "TWITTER", "GOOGLE_NEWS", "ARGENTINE_STREAMING_MEDIA", "ARGENTINE_PRESS", "ARGENTINA_DATA"] },
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: { id: true, title: true, description: true, sourceUrl: true, platform: true, createdAt: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    activeClient
      ? prisma.opportunity.findMany({
          where: {
            clientId: activeClient.id,
            channel: { OR: [{ name: { contains: "X", mode: "insensitive" } }, { name: { contains: "Twitter", mode: "insensitive" } }] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            status: { not: "DISCARDED" },
          },
          select: { id: true, sourceText: true, sourceUrl: true, sourceAuthor: true, createdAt: true },
          orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
          take: 3,
        })
      : Promise.resolve([]),
  ]);
  const pulseSignals = selectCopilotPulse([
    ...pulse.map((signal) => ({
      id: signal.id,
      title: signal.title,
      description: signal.description,
      sourceUrl: signal.sourceUrl,
      platform: signal.platform,
      createdAt: signal.createdAt.toISOString(),
    })),
    ...twitterConversations.map((opportunity) => ({
      id: `x-conversation-${opportunity.id}`,
      title: opportunity.sourceAuthor ? `X: ${opportunity.sourceAuthor}` : "Conversación en X",
      description: opportunity.sourceText,
      sourceUrl: opportunity.sourceUrl,
      platform: "X_CONVERSATION",
      createdAt: opportunity.createdAt.toISOString(),
    })),
  ]).map((signal) => ({
    id: signal.id,
    title: signal.title,
    description: signal.description,
    sourceUrl: signal.sourceUrl,
    platform: signal.platform,
    createdAt: new Date(signal.createdAt).toISOString(),
    reason: signal.reason,
    allowHumor: signal.allowHumor,
  }));

  return (
    <CopilotWorkspace
      activeClient={activeClient ? { slug: activeClient.slug, name: activeClient.name } : null}
      activeView={activeView}
      filters={{ brands: brands.map((brand) => ({ id: brand.id, name: brand.name })), channels: channels.map((channel) => ({ id: channel.id, name: channel.name })), selectedBrand: selectedBrand ?? "", selectedChannel: selectedChannel ?? "", selectedResponse, selectedSort }}
      pulse={pulseSignals}
      opportunities={opportunities.map((opportunity) => ({
        id: opportunity.id,
        text: opportunity.sourceText,
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
        })),
      }))}
    />
  );
}

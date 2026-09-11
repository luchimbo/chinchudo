import { prisma } from "@/lib/db";
import { getVisibleClients, requirePageClient } from "@/lib/auth";
import VideosClient from "./VideosClient";

type PageProps = {
  searchParams: { client?: string };
};

export default async function VideosPage({ searchParams }: PageProps) {
  const params = searchParams;
  const [activeClient, clients] = await Promise.all([
    requirePageClient(prisma, params.client),
    getVisibleClients(prisma),
  ]);

  const radarSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const radarPlatforms = ["TIKTOK", "TIKTOK_HASHTAG", "TIKTOK_CREATIVE_CENTER", "INSTAGRAM", "YOUTUBE", "VIRAL_MARKETING"];

  // Cargar datos asociados al cliente activo
  const [trends, products, scripts] = await Promise.all([
    prisma.trend.findMany({
      where: { clientId: activeClient.id, platform: { in: radarPlatforms }, createdAt: { gte: radarSince } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { brand: { clientId: activeClient.id } },
      include: { brand: true },
      orderBy: { name: "asc" },
    }),
    prisma.videoScript.findMany({
      where: { clientId: activeClient.id },
      include: {
        product: true,
        persona: true,
        trend: { select: { title: true } },
        contentIdea: { select: { hook: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <VideosClient
      activeClient={activeClient}
      clients={clients}
      trends={trends}
      products={products}
      scripts={scripts}
    />
  );
}

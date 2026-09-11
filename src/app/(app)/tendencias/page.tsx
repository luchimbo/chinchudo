import { getVisibleClients, requirePageClient } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TendenciasClient from "./TendenciasClient";

type PageProps = { searchParams: { client?: string } };

const CONTEXT_PLATFORMS = [
  "GOOGLE_NEWS",
  "ARGENTINE_STREAMING_MEDIA",
  "ARGENTINE_PRESS",
  "ARGENTINA_DATA",
  "URL_ARTICLE",
  "PODCAST",
];

export default async function TendenciasPage({ searchParams }: PageProps) {
  const [activeClient, clients] = await Promise.all([
    requirePageClient(prisma, searchParams.client),
    getVisibleClients(prisma),
  ]);

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const signals = await prisma.trend.findMany({
    where: { clientId: activeClient.id, platform: { in: CONTEXT_PLATFORMS }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return <TendenciasClient activeClient={activeClient} clients={clients} signals={signals} />;
}

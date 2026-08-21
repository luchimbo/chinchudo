import { getVisibleClients } from "@/lib/auth";
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
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;

  if (!activeClient) {
    return <div className="mx-auto max-w-4xl px-5 py-10"><h1 className="font-display text-3xl font-bold text-ink">Tendencias</h1><p className="mt-2 text-slate">No hay clientes configurados en el sistema.</p></div>;
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const signals = await prisma.trend.findMany({
    where: { clientId: activeClient.id, platform: { in: CONTEXT_PLATFORMS }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return <TendenciasClient activeClient={activeClient} clients={clients} signals={signals} />;
}

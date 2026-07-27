import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, getVisibleClients } from "@/lib/auth";
import VideosClient from "./VideosClient";

type PageProps = {
  searchParams: { client?: string };
};

export default async function VideosPage({ searchParams }: PageProps) {
  const params = searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === params.client) ?? clients[0] ?? null;

  if (!activeClient) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-2xl font-bold text-ink">Tendencias y Guiones</h1>
        <p className="mt-2 text-slate">No hay clientes configurados en el sistema.</p>
      </div>
    );
  }

  const radarSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const radarPlatforms = ["TIKTOK", "TIKTOK_HASHTAG", "TIKTOK_CREATIVE_CENTER", "INSTAGRAM", "YOUTUBE", "VIRAL_MARKETING"];

  // Cargar datos asociados al cliente activo
  const [trends, products, personas, scripts, ideas] = await Promise.all([
    prisma.trend.findMany({
      where: { clientId: activeClient.id, platform: { in: radarPlatforms }, createdAt: { gte: radarSince } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { brand: { clientId: activeClient.id } },
      include: { brand: true },
      orderBy: { name: "asc" },
    }),
    prisma.persona.findMany({
      where: { clientId: activeClient.id },
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
    prisma.contentIdea.findMany({
      where: { clientId: activeClient.id },
      include: { product: { include: { brand: true } }, trend: { select: { title: true } }, videoScripts: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <VideosClient
      activeClient={activeClient}
      clients={clients}
      trends={trends}
      products={products}
      personas={personas}
      scripts={scripts}
      ideas={ideas}
    />
  );
}

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, getVisibleClients } from "@/lib/auth";
import VideosClient from "./VideosClient";

type PageProps = {
  searchParams: Promise<{ client?: string }>;
};

export default async function VideosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === params.client) ?? clients[0] ?? null;

  if (!activeClient) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-2xl font-bold text-ink">Videos IA</h1>
        <p className="mt-2 text-slate">No hay clientes configurados en el sistema.</p>
      </div>
    );
  }

  // Cargar datos asociados al cliente activo
  const [trends, products, personas, scripts] = await Promise.all([
    prisma.trend.findMany({
      where: { clientId: activeClient.id },
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
      personas={personas}
      scripts={scripts}
    />
  );
}

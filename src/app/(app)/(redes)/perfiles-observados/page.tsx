import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";

type PageProps = {
  searchParams: { client?: string };
};

export default async function PerfilesObservadosPage({ searchParams }: PageProps) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const profiles = activeClient
    ? await prisma.observedProfile.findMany({
        where: { clientId: activeClient.id },
        orderBy: [{ lastSeenAt: "desc" }],
        take: 40,
      })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Perfiles observados</h1>
        <p className="mt-2 text-sm text-slate">
          Memoria acumulada por cuenta observada: intereses, tono y señal comercial reciente.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white/75 shadow-panel backdrop-blur">
        <div className="border-b border-ink/10 px-5 py-4">
          <p className="text-sm text-slate/75">
            {activeClient ? `${activeClient.name} · ${profiles.length} perfiles` : "Sin cliente activo"}
          </p>
        </div>

        {profiles.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate">Todavía no hay perfiles observados para este cliente.</div>
        ) : (
          <div className="divide-y divide-ink/10">
            {profiles.map((profile) => {
              const primaryTopics = Array.isArray(profile.primaryTopics) ? profile.primaryTopics as string[] : [];
              const engagementPattern = (profile.engagementPattern || {}) as { recentEvents?: number; dominantIntent?: string };
              return (
                <article key={profile.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_160px]">
                  <div>
                    <p className="text-sm font-bold text-ink">{profile.displayName || profile.externalHandle}</p>
                    <p className="mt-1 text-xs text-slate/70">{profile.platform} · {profile.externalHandle}</p>
                    <p className="mt-3 text-sm text-ink">
                      {primaryTopics.join(", ") || "Sin topics dominantes"} · tono {profile.toneSummary || "mixed"}
                    </p>
                    <p className="mt-1 text-xs text-slate/70">
                      Readiness {profile.commercialReadiness}/100 · recientes {Number(engagementPattern.recentEvents ?? 0)} · intent dominante {String(engagementPattern.dominantIntent ?? "GENERAL_DISCUSSION")}
                    </p>
                  </div>
                  <div className="flex items-center justify-start md:justify-end">
                    <Link
                      href={activeClient ? `/oportunidades?client=${activeClient.slug}&q=${encodeURIComponent(profile.externalHandle)}` : "/oportunidades"}
                      className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
                    >
                      Ver oportunidades
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

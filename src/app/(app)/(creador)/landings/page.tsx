import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { updateLandingStatus } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  APPROVED: "Lista para publicar",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-signal/10 text-signal border-signal/30",
  APPROVED: "bg-brass/10 text-brass border-brass/40",
  PUBLISHED: "bg-moss/10 text-moss border-moss/30",
  ARCHIVED: "bg-ink/5 text-ink/55 border-ink/10",
};

function fmt(d: Date | null | string) {
  return d ? new Date(d).toLocaleDateString("es-AR") : "—";
}

export default async function LandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string }>;
}) {
  const { status = "DRAFT", client: clientSlug } = await searchParams;
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === clientSlug) ?? clients[0] ?? null;

  const clientFilter = activeClient ? { clientId: activeClient.id } : {};

  const [counts, landings] = await Promise.all([
    prisma.landing.groupBy({
      by: ["status"],
      where: clientFilter,
      _count: { id: true },
    }),
    prisma.landing.findMany({
      where: { status: status as any, ...clientFilter },
      include: { leadMagnet: true, _count: { select: { leads: true, trackingEvents: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));
  const clientParam = activeClient ? `&client=${activeClient.slug}` : "";

  const tabs = [
    { status: "DRAFT", label: "Borradores" },
    { status: "APPROVED", label: "Listas para publicar" },
    { status: "PUBLISHED", label: "En vivo" },
    { status: "ARCHIVED", label: "Archivadas" },
  ];

  const dbBlogBase = activeClient
    ? ((await prisma.client.findUnique({ where: { id: activeClient.id }, select: { blogBaseUrl: true } }))?.blogBaseUrl || "")
    : "";
  const blogBase = dbBlogBase || process.env.LANDING_BASE_URL || "https://blog.pcmidicenter.com";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Artículos del blog</h1>
          <p className="mt-0.5 text-sm text-slate">Páginas que generan visitas orgánicas y capturan contactos interesados.</p>
        </div>
        <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-slate">{landings.length} resultados</span>
      </header>

      <div className="mb-6 flex gap-2 border-b border-ink/10 pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.status}
            href={`/landings?status=${tab.status}${clientParam}`}
            className={`rounded-t px-4 py-2 text-sm font-medium transition ${
              status === tab.status ? "border-b-2 border-ink text-ink" : "text-slate hover:text-ink"
            }`}
          >
            {tab.label}
            {countMap[tab.status] ? (
              <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs">{countMap[tab.status]}</span>
            ) : null}
          </Link>
        ))}
      </div>

      {landings.length === 0 ? (
        <p className="text-sm text-slate">No hay landings en este estado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {landings.map((landing) => (
            <div key={landing.id} className="rounded-xl border border-ink/10 bg-paper p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[landing.status]}`}>
                      {STATUS_LABELS[landing.status]}
                    </span>
                    <span className="text-xs text-slate">{fmt(landing.createdAt)}</span>
                    {landing.leadMagnet && (
                      <span className="rounded-full bg-brass/10 px-2 py-0.5 text-xs text-brass">
                        Lead magnet: {landing.leadMagnet.tipo.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 font-semibold text-ink">{landing.titulo || landing.slug}</h2>
                  <p className="mt-0.5 text-xs text-slate">{landing.keyword}</p>
                  <div className="mt-2 flex gap-4 text-xs text-slate">
                    <span>👁 {landing._count.trackingEvents} visitas</span>
                    <span>📧 {landing._count.leads} contactos capturados</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  {landing.status === "DRAFT" && (
                    <>
                      <form action={updateLandingStatus}>
                        <input type="hidden" name="id" value={landing.id} />
                        <input type="hidden" name="status" value="APPROVED" />
                        <button type="submit" className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-xs font-semibold text-brass transition hover:bg-brass/20">
                          Aprobar
                        </button>
                      </form>
                      <form action={updateLandingStatus}>
                        <input type="hidden" name="id" value={landing.id} />
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <button type="submit" className="rounded-lg border border-signal/40 bg-signal/5 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/15">
                          Archivar
                        </button>
                      </form>
                    </>
                  )}
                  {landing.status === "APPROVED" && (
                    <>
                      <form action={updateLandingStatus}>
                        <input type="hidden" name="id" value={landing.id} />
                        <input type="hidden" name="status" value="PUBLISHED" />
                        <button type="submit" className="rounded-lg border border-moss/40 bg-moss/10 px-3 py-1.5 text-xs font-semibold text-moss transition hover:bg-moss/20">
                          Publicar
                        </button>
                      </form>
                      <form action={updateLandingStatus}>
                        <input type="hidden" name="id" value={landing.id} />
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <button type="submit" className="rounded-lg border border-signal/40 bg-signal/5 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/15">
                          Archivar
                        </button>
                      </form>
                    </>
                  )}
                  {landing.status === "PUBLISHED" && (
                    <>
                      <a
                        href={`${blogBase.replace(/\/$/, "")}/${landing.slug}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/40"
                      >
                        Ver landing
                      </a>
                      <form action={updateLandingStatus}>
                        <input type="hidden" name="id" value={landing.id} />
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <button type="submit" className="rounded-lg border border-signal/40 bg-signal/5 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/15">
                          Despublicar / Archivar
                        </button>
                      </form>
                    </>
                  )}
                  {landing.status === "ARCHIVED" && (
                    <form action={updateLandingStatus}>
                      <input type="hidden" name="id" value={landing.id} />
                      <input type="hidden" name="status" value="DRAFT" />
                      <button type="submit" className="rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink">
                        Restaurar a borrador
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

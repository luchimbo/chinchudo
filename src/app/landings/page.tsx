import Link from "next/link";
import { prisma } from "@/lib/db";
import { updateLandingStatus } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  APPROVED: "Aprobada",
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
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "DRAFT" } = await searchParams;

  const [counts, landings] = await Promise.all([
    prisma.landing.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.landing.findMany({
      where: { status: status as any },
      include: { leadMagnet: true, _count: { select: { leads: true, trackingEvents: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

  const tabs = [
    { status: "DRAFT", label: "Borradores" },
    { status: "APPROVED", label: "Aprobadas" },
    { status: "PUBLISHED", label: "Publicadas" },
    { status: "ARCHIVED", label: "Archivadas" },
  ];

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">Landings SEO</h1>
        </div>
        <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-slate">
          {landings.length} resultados
        </span>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-ink/10 pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.status}
            href={`/landings?status=${tab.status}`}
            className={`rounded-t px-4 py-2 text-sm font-medium transition ${
              status === tab.status
                ? "border-b-2 border-ink text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            {tab.label}
            {countMap[tab.status] ? (
              <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs">
                {countMap[tab.status]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {landings.length === 0 ? (
        <p className="text-sm text-slate">No hay landings en este estado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {landings.map((landing) => (
            <div
              key={landing.id}
              className="rounded-xl border border-ink/10 bg-paper p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[landing.status]}`}
                    >
                      {STATUS_LABELS[landing.status]}
                    </span>
                    <span className="text-xs text-slate">{fmt(landing.createdAt)}</span>
                    {landing.leadMagnet && (
                      <span className="rounded-full bg-brass/10 px-2 py-0.5 text-xs text-brass">
                        Lead magnet: {landing.leadMagnet.tipo.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 font-semibold text-ink">
                    {landing.titulo || landing.slug}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate">{landing.keyword}</p>
                  <div className="mt-2 flex gap-4 text-xs text-slate">
                    <span>👁 {landing._count.trackingEvents} visitas</span>
                    <span>📧 {landing._count.leads} leads</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {landing.status === "DRAFT" && (
                    <form action={updateLandingStatus}>
                      <input type="hidden" name="id" value={landing.id} />
                      <input type="hidden" name="status" value="APPROVED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-xs font-semibold text-brass transition hover:bg-brass/20"
                      >
                        Aprobar
                      </button>
                    </form>
                  )}
                  {landing.status === "APPROVED" && (
                    <form action={updateLandingStatus}>
                      <input type="hidden" name="id" value={landing.id} />
                      <input type="hidden" name="status" value="PUBLISHED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-moss/40 bg-moss/10 px-3 py-1.5 text-xs font-semibold text-moss transition hover:bg-moss/20"
                      >
                        Publicar
                      </button>
                    </form>
                  )}
                  {landing.publishedAt && (
                    <a
                      href={`${process.env.LANDING_BASE_URL ?? "https://blog.pcmidicenter.com"}/${landing.slug}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/40"
                    >
                      Ver landing
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

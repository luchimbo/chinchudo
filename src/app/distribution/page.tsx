import Link from "next/link";
import { prisma } from "@/lib/db";
import { approveDistribution } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nueva",
  APPROVED: "Aprobada",
  SCHEDULED: "Programada",
  PUBLISHED: "Publicada",
  FAILED: "Falló",
};

const STATUS_CLASS: Record<string, string> = {
  NEW: "bg-signal/10 text-signal border-signal/30",
  APPROVED: "bg-brass/10 text-brass border-brass/40",
  SCHEDULED: "bg-sky-50 text-sky-700 border-sky-200",
  PUBLISHED: "bg-moss/10 text-moss border-moss/30",
  FAILED: "bg-signal/20 text-signal border-signal/40",
};

function fmt(d: Date | null | string) {
  return d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

const CANAL_EMOJI: Record<string, string> = {
  REDDIT: "🟠",
  LINKEDIN: "🔵",
  TWITTER: "🐦",
  FACEBOOK: "📘",
  INSTAGRAM: "📸",
  YOUTUBE: "▶️",
  NEWSLETTER: "📧",
  FORUM: "💬",
};

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "NEW" } = await searchParams;

  const [counts, pieces] = await Promise.all([
    prisma.distributionPiece.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.distributionPiece.findMany({
      where: { status: status as any },
      include: { landing: { select: { slug: true, titulo: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

  const tabs = ["NEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED"];

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">Distribución</h1>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-ink/10 pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/distribution?status=${tab}`}
            className={`rounded-t px-3 py-2 text-sm font-medium transition ${
              status === tab ? "border-b-2 border-ink text-ink" : "text-slate hover:text-ink"
            }`}
          >
            {STATUS_LABELS[tab]}
            {countMap[tab] ? (
              <span className="ml-1.5 rounded-full bg-ink/10 px-2 py-0.5 text-xs">
                {countMap[tab]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {pieces.length === 0 ? (
        <p className="text-sm text-slate">No hay piezas en este estado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pieces.map((piece) => (
            <div key={piece.id} className="rounded-xl border border-ink/10 bg-paper p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      {CANAL_EMOJI[piece.canal] ?? "📢"} {piece.canal.toLowerCase()}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[piece.status]}`}
                    >
                      {STATUS_LABELS[piece.status]}
                    </span>
                    <span className="text-xs text-slate">{fmt(piece.createdAt)}</span>
                  </div>
                  {piece.landing && (
                    <p className="mt-1 text-xs text-slate">
                      Landing: {piece.landing.titulo || piece.landing.slug}
                    </p>
                  )}
                  <p className="mt-2 line-clamp-3 text-sm text-ink/80">{piece.contenido}</p>
                  {piece.scheduledAt && (
                    <p className="mt-1 text-xs text-slate">Programada: {fmt(piece.scheduledAt)}</p>
                  )}
                </div>
                {piece.status === "NEW" && (
                  <form action={approveDistribution}>
                    <input type="hidden" name="id" value={piece.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-xs font-semibold text-brass transition hover:bg-brass/20"
                    >
                      Aprobar
                    </button>
                  </form>
                )}
                {piece.publishedUrl && (
                  <a
                    href={piece.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/40"
                  >
                    Ver publicación
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

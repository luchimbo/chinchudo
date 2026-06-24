import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { ClientSwitcher } from "@/components/client-switcher";

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

const RESULT_LABEL: Record<string, { label: string; cls: string }> = {
  published_via_agent: { label: "Publicado", cls: "bg-moss/10 text-moss border-moss/30" },
  published_manually:  { label: "Manual",    cls: "bg-moss/10 text-moss border-moss/30" },
  failed:              { label: "Falló",      cls: "bg-signal/10 text-signal border-signal/30" },
  skipped:             { label: "Saltado",    cls: "bg-ink/5 text-slate border-ink/10" },
};

function fmt(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

const PERSONA_LABEL: Record<string, string> = {
  "baterista-departamento": "Baterista de Departamento",
  "profe-musica":           "Profe de Música",
  "productor-home-studio":  "Técnico / Productor",
  "cazador-ofertas":        "Cazador de Ofertas",
  "trend-setter-kressmer":  "Early Kressmer",
};

const CANAL_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK:  "Facebook",
  TWITTER:   "X / Twitter",
  LINKEDIN:  "LinkedIn",
  YOUTUBE:   "YouTube",
  REDDIT:    "Reddit",
  NEWSLETTER:"Newsletter",
  FORUM:     "Foro",
};

type PageProps = { searchParams: { client?: string } };

export default async function ActividadPage({ searchParams }: PageProps) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === searchParams.client) ?? clients[0] ?? null;

  const [apostolLogs, enjambrePubs] = await Promise.all([
    // Respuestas publicadas en redes (comentarios en posts ajenos)
    prisma.publishingLog.findMany({
      where: activeClient
        ? { opportunity: { OR: [{ detectedBrand: { clientId: activeClient.id } }, { monitoredSource: { clientId: activeClient.id } }] } }
        : {},
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        id: true,
        publishedAt: true,
        publishedBy: true,
        account: true,
        result: true,
        publishedUrl: true,
        opportunity: {
          select: {
            sourceText: true,
            channel: { select: { name: true } },
          },
        },
        response: {
          select: {
            draftText: true,
            editedText: true,
            persona: { select: { name: true } },
          },
        },
      },
    }),

    // Posts propios de la marca desde las landings
    prisma.distributionPiece.findMany({
      where: {
        status: "PUBLISHED",
        opportunityId: null,
        ...(activeClient ? { clientId: activeClient.id } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: 80,
      select: {
        id: true,
        canal: true,
        contenido: true,
        publishedAt: true,
        publishedUrl: true,
        landing: { select: { slug: true, titulo: true } },
      },
    }),
  ]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={activeClient ? `/?client=${activeClient.slug}` : "/"} className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">Actividad en redes</h1>
          <p className="mt-0.5 text-sm text-slate">
            Todo lo que se publicó: respuestas en redes y posts propios de la marca.
          </p>
        </div>
        {clients.length > 0 && (
          <ClientSwitcher clients={clients} activeSlug={activeClient?.slug ?? clients[0].slug} />
        )}
      </header>

      <div className="flex flex-col gap-10">

        {/* ── APÓSTOLES ── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink/10" />
            <div className="flex items-center gap-2 rounded-full border border-ink/15 bg-paper px-4 py-1.5 shadow-sm">
              <span className="text-sm font-bold text-ink">Respuestas en redes</span>
              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-slate">{apostolLogs.length} publicaciones</span>
            </div>
            <div className="h-px flex-1 bg-ink/10" />
          </div>
          <p className="mb-4 text-xs text-slate">
            Respuestas publicadas como comentarios en conversaciones de otras personas.
          </p>

          {apostolLogs.length === 0 ? (
            <p className="text-sm text-slate">Todavía no hay publicaciones registradas.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {apostolLogs.map((log) => {
                const texto = log.response?.editedText ?? log.response?.draftText ?? "";
                const result = RESULT_LABEL[log.result] ?? { label: log.result, cls: "bg-ink/5 text-slate border-ink/10" };
                const canal = log.opportunity?.channel?.name ?? "—";
                const persona = PERSONA_LABEL[log.account] ?? log.account;
                return (
                  <div key={log.id} className="rounded-xl border border-ink/10 bg-paper p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Meta */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-sm">{CANAL_EMOJI[canal.toUpperCase()] ?? "📢"}</span>
                          <span className="text-xs font-semibold text-ink">{canal}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${result.cls}`}>
                            {result.label}
                          </span>
                          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-slate">
                            {persona}
                          </span>
                          <span className="text-xs text-slate/60">{fmt(log.publishedAt)}</span>
                        </div>

                        {/* Contexto: post original */}
                        {log.opportunity?.sourceText && (
                          <p className="mb-2 text-xs text-slate/60 italic line-clamp-1 border-l-2 border-ink/10 pl-2">
                            En respuesta a: &quot;{log.opportunity.sourceText.slice(0, 100)}&quot;
                          </p>
                        )}

                        {/* Texto publicado */}
                        <p className="text-sm text-ink/80 line-clamp-3">{texto}</p>
                      </div>

                      {log.publishedUrl && (
                        <a
                          href={log.publishedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink/40"
                        >
                          Ver →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── ENJAMBRE / BRUNO LABS ── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink/10" />
            <div className="flex items-center gap-2 rounded-full border border-brass/30 bg-brass/5 px-4 py-1.5 shadow-sm">
              <span className="text-sm font-bold text-ink">Posts de la marca</span>
              <span className="rounded-full bg-brass/10 px-2 py-0.5 text-xs text-brass">{enjambrePubs.length} publicaciones</span>
            </div>
            <div className="h-px flex-1 bg-ink/10" />
          </div>
          <p className="mb-4 text-xs text-slate">
            Posts propios de {activeClient?.name ?? "la marca"} generados a partir del blog: Instagram, Facebook, X, LinkedIn, YouTube.
          </p>

          {enjambrePubs.length === 0 ? (
            <p className="text-sm text-slate">
              Las publicaciones del enjambre aparecen acá una vez importadas.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {enjambrePubs.map((p) => (
                <div key={p.id} className="rounded-xl border border-brass/10 bg-brass/[0.03] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm">{CANAL_EMOJI[p.canal] ?? "📢"}</span>
                        <span className="text-xs font-semibold text-ink">{CANAL_LABEL[p.canal] ?? p.canal}</span>
                        <span className="rounded-full border border-moss/30 bg-moss/10 px-2 py-0.5 text-xs font-semibold text-moss">
                          Publicado
                        </span>
                        <span className="text-xs text-slate/60">{fmt(p.publishedAt)}</span>
                      </div>

                      {p.landing && (
                        <p className="mb-1.5 text-xs text-brass/80">
                          Desde: {p.landing.titulo || p.landing.slug}
                        </p>
                      )}

                      <p className="text-sm text-ink/80 line-clamp-3">{p.contenido}</p>
                    </div>

                    {p.publishedUrl && (
                      <a
                        href={p.publishedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink/40"
                      >
                        Ver →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}

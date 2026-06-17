import Link from "next/link";
import { prisma } from "@/lib/db";

function scoreColor(score: number) {
  if (score >= 4) return "text-moss font-bold";
  if (score >= 2) return "text-brass font-semibold";
  return "text-signal";
}

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("es-AR");
}

export default async function GeoPage() {
  const [audits, avg] = await Promise.all([
    prisma.geoAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.geoAudit.aggregate({ _avg: { score: true }, _count: { id: true } }),
  ]);

  const avgScore = avg._avg.score ? avg._avg.score.toFixed(1) : "—";

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">Presencia en IAs</h1>
          <p className="mt-0.5 text-sm text-slate">
            ¿Qué tan seguido aparece PC MIDI Center cuando alguien le pregunta a ChatGPT, Claude o Gemini sobre equipos de audio?
          </p>
        </div>
        <div className="rounded-xl border border-ink/10 bg-paper px-5 py-3 text-center shadow-sm">
          <p className="text-xs text-slate">Visibilidad promedio</p>
          <p className={`text-3xl ${scoreColor(parseFloat(avgScore) || 0)}`}>{avgScore}</p>
          <p className="text-xs text-slate">/ 5 · {avg._count.id} {avg._count.id === 1 ? "consulta" : "consultas"}</p>
        </div>
      </header>

      {audits.length === 0 ? (
        <p className="text-sm text-slate">
          Todavía no hay consultas registradas. Los agentes las corren automáticamente cada semana.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {audits.map((audit) => {
            const competidores = Array.isArray(audit.competidores) ? audit.competidores : [];
            const gaps = Array.isArray(audit.gapsSugeridos) ? audit.gapsSugeridos : [];
            return (
              <div key={audit.id} className="rounded-xl border border-ink/10 bg-paper p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-2xl tabular-nums ${scoreColor(audit.score)}`}>
                        {audit.score}/5
                      </span>
                      <span className="text-xs text-slate/70">visibilidad</span>
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-slate">
                        vía {audit.modeloIA}
                      </span>
                      <span className="text-xs text-slate">{fmt(audit.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink/80 italic">"{audit.prompt}"</p>
                    {competidores.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-slate">Marcas que la IA menciona en lugar de PC MIDI:</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(competidores as string[]).map((c, i) => (
                            <span key={i} className="rounded-full bg-signal/10 px-2 py-0.5 text-xs text-signal">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {gaps.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-slate">Qué falta cubrir para aparecer más:</p>
                        <ul className="mt-1 list-inside list-disc text-xs text-ink/70">
                          {(gaps as string[]).slice(0, 3).map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

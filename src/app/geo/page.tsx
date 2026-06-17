import Link from "next/link";
import { prisma } from "@/lib/db";

// Marcas exclusivas de PC MIDI Center (solo nosotros las vendemos en Argentina)
// Orden: modelos específicos primero, marca sola al final como fallback
// Modelos específicos primero (más largo → más específico), marca sola como fallback.
// La búsqueda es substring en lowercase, así "minilab" matchea "MiniLab", "Minilab 3", etc.
const CATALOGO_EXCLUSIVO: { modelo: string; marca: string; display: string }[] = [
  // Arturia — modelos específicos
  { modelo: "keystep pro",  marca: "arturia", display: "Arturia KeyStep Pro" },
  { modelo: "keystep",      marca: "arturia", display: "Arturia KeyStep" },
  { modelo: "microfreak",   marca: "arturia", display: "Arturia MicroFreak" },
  { modelo: "minifreak",    marca: "arturia", display: "Arturia MiniFeak" },
  { modelo: "polybrute",    marca: "arturia", display: "Arturia PolyBrute" },
  { modelo: "keylab 88",    marca: "arturia", display: "Arturia KeyLab 88" },
  { modelo: "microlab",     marca: "arturia", display: "Arturia MicroLab" },
  { modelo: "minilab",      marca: "arturia", display: "Arturia MiniLab" },
  { modelo: "beatstep",     marca: "arturia", display: "Arturia BeatStep" },
  { modelo: "minifuse",     marca: "arturia", display: "Arturia MiniFuse" },
  // MidiPlus — modelos específicos
  { modelo: "akm322",       marca: "midiplus", display: "MidiPlus AKM322" },
  { modelo: "ak490",        marca: "midiplus", display: "MidiPlus AK490" },
  { modelo: "studio m",     marca: "midiplus", display: "MidiPlus Studio M" },
  { modelo: "ms6",          marca: "midiplus", display: "MidiPlus MS6" },
  { modelo: "ms5",          marca: "midiplus", display: "MidiPlus MS5" },
  { modelo: "usb800",       marca: "midiplus", display: "MidiPlus USB800" },
  { modelo: "bm800",        marca: "midiplus", display: "MidiPlus BM800" },
  { modelo: "ed8",          marca: "midiplus", display: "MidiPlus ED8" },
  { modelo: "ed6",          marca: "midiplus", display: "MidiPlus ED6" },
  // Synido — modelos específicos
  { modelo: "livemix duet", marca: "synido", display: "Synido LiveMix Duet" },
  { modelo: "livemix solo", marca: "synido", display: "Synido LiveMix Solo" },
  { modelo: "livedock pro", marca: "synido", display: "Synido LiveDock Pro" },
  { modelo: "livedock",     marca: "synido", display: "Synido LiveDock" },
  { modelo: "tempokey w25", marca: "synido", display: "Synido TempoKey W25" },
  { modelo: "tempokey 25",  marca: "synido", display: "Synido TempoKey 25" },
  { modelo: "tempopad",     marca: "synido", display: "Synido TempoPad" },
  // Alctron — modelos específicos
  { modelo: "um900",        marca: "alctron", display: "Alctron UM900" },
  { modelo: "mc001",        marca: "alctron", display: "Alctron MC001" },
  { modelo: "ma614",        marca: "alctron", display: "Alctron MA614" },
  // Meike
  { modelo: "meike",        marca: "meike",   display: "Meike" },
  // Fallbacks: marca sola (si no matcheó ningún modelo específico)
  { modelo: "arturia",      marca: "arturia",  display: "Arturia (sin modelo específico)" },
  { modelo: "midiplus",     marca: "midiplus", display: "MidiPlus (sin modelo específico)" },
  { modelo: "synido",       marca: "synido",   display: "Synido (sin modelo específico)" },
  { modelo: "alctron",      marca: "alctron",  display: "Alctron (sin modelo específico)" },
];

function detectarNuestros(texto: string): { display: string; marca: string }[] {
  const t = texto.toLowerCase();
  const encontrados: { display: string; marca: string }[] = [];
  const marcasYaAgregadas = new Set<string>();

  for (const item of CATALOGO_EXCLUSIVO) {
    if (t.includes(item.modelo)) {
      // Evitar agregar "Arturia" (fallback) si ya encontramos modelos específicos de Arturia
      const esGenerico = item.modelo === item.marca;
      if (esGenerico && marcasYaAgregadas.has(item.marca)) continue;
      if (!encontrados.find((e) => e.display === item.display)) {
        encontrados.push({ display: item.display, marca: item.marca });
        marcasYaAgregadas.add(item.marca);
      }
    }
  }
  return encontrados;
}

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
      take: 200,
    }),
    prisma.geoAudit.aggregate({ _avg: { score: true }, _count: { id: true } }),
  ]);

  const avgScore = avg._avg.score ? avg._avg.score.toFixed(1) : "—";

  // Estadísticas de "nuestros productos mencionados junto a competidores"
  let auditsConNuestros = 0;
  let auditsMLconNuestros = 0;
  const productoConteo: Record<string, number> = {};
  for (const audit of audits) {
    const nuestros = detectarNuestros(audit.respuestaCompleta);
    const tieneML = (audit.competidores as string[]).some((c) =>
      c.toLowerCase().includes("mercado")
    );
    if (nuestros.length > 0) {
      auditsConNuestros++;
      if (tieneML) auditsMLconNuestros++;
      for (const p of nuestros) productoConteo[p.display] = (productoConteo[p.display] ?? 0) + 1;
    }
  }
  const topProductos = Object.entries(productoConteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  // Contar menciones de competidores en todas las consultas
  const competitorCount: Record<string, number> = {};
  for (const audit of audits) {
    const comps = Array.isArray(audit.competidores) ? audit.competidores : [];
    for (const c of comps as string[]) {
      const key = c.toLowerCase().trim();
      competitorCount[key] = (competitorCount[key] ?? 0) + 1;
    }
  }
  const topCompetitors = Object.entries(competitorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const maxMentions = topCompetitors[0]?.[1] ?? 1;

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

      {/* Panel: nuestros productos mencionados por la IA */}
      {topProductos.length > 0 && (
        <section className="mb-6 rounded-xl border border-brass/25 bg-brass/5 p-5">
          <h2 className="mb-0.5 text-sm font-bold text-ink">
            La IA menciona productos que vendemos — pero manda a MercadoLibre
          </h2>
          <p className="mb-4 text-xs text-slate">
            En <span className="font-semibold text-signal">{auditsMLconNuestros}</span> de las {audits.length} consultas,
            la IA recomienda marcas de nuestro catálogo (Arturia, Focusrite, etc.) pero
            dirige la compra a MercadoLibre en vez de a PC MIDI Center.
            {auditsConNuestros - auditsMLconNuestros > 0 && (
              <> En otras <span className="font-semibold text-moss">{auditsConNuestros - auditsMLconNuestros}</span> nos menciona sin redirigir a ML.</>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {topProductos.map(([nombre, count]) => (
              <div key={nombre} className="flex items-center gap-1.5 rounded-full border border-brass/30 bg-brass/10 px-3 py-1">
                <span className="text-xs font-semibold capitalize text-brass">{nombre}</span>
                <span className="text-xs text-brass/60">{count}x</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Panel de competidores globales */}
      {topCompetitors.length > 0 && (
        <section className="mb-8 rounded-xl border border-signal/20 bg-signal/5 p-5">
          <h2 className="mb-1 text-sm font-bold text-ink">
            Marcas que la IA menciona en lugar de PC MIDI
          </h2>
          <p className="mb-4 text-xs text-slate">
            Cuántas veces apareció cada marca en las {avg._count.id} consultas analizadas.
          </p>
          <div className="flex flex-col gap-2">
            {topCompetitors.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-32 truncate text-xs font-medium capitalize text-ink">
                  {name}
                </span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-ink/10 h-2">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-signal/60"
                    style={{ width: `${(count / maxMentions) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs text-slate">
                  {count}x
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {audits.length === 0 ? (
        <p className="text-sm text-slate">
          Todavía no hay consultas registradas. Los agentes las corren automáticamente cada semana.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink">Detalle por consulta</h2>
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
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-semibold text-slate">La IA mencionó en esta búsqueda:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(competidores as string[]).map((c, i) => (
                            <span
                              key={i}
                              className="rounded-full border border-signal/30 bg-signal/10 px-2.5 py-0.5 text-xs font-medium capitalize text-signal"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const nuestros = detectarNuestros(audit.respuestaCompleta);
                      const tieneML = (competidores as string[]).some(c =>
                        c.toLowerCase().includes("mercado")
                      );
                      if (nuestros.length === 0) return null;
                      return (
                        <div className={`mt-2 rounded-lg border px-3 py-2 ${tieneML ? "border-brass/30 bg-brass/5" : "border-moss/30 bg-moss/5"}`}>
                          <p className="mb-1.5 text-xs font-semibold text-brass">
                            {tieneML
                              ? "⚠️ Menciona productos nuestros pero manda a MercadoLibre:"
                              : "✓ Menciona productos nuestros:"}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {nuestros.map((p) => (
                              <span key={p.display} className="rounded-full border border-brass/30 bg-brass/10 px-2.5 py-0.5 text-xs font-semibold text-brass">
                                {p.display}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {competidores.length === 0 && (
                      <div className="mt-2">
                        <span className="rounded-full border border-moss/30 bg-moss/10 px-2.5 py-0.5 text-xs font-medium text-moss">
                          ✓ No mencionó competidores
                        </span>
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

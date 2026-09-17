import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients, requirePageClient } from "@/lib/auth";
import { deleteClientMemoryAction, createManualClientMemoryAction, unmarkAcceptedResponseAction, updateClientMemoryAction } from "../opportunities/actions";
import { SubmitButton } from "../opportunities/[id]/SubmitButton";

const CATEGORY_COLORS: Record<string, string> = {
  tone: "bg-purple-100 text-purple-800 border-purple-200",
  warranty: "bg-blue-100 text-blue-800 border-blue-200",
  product: "bg-emerald-100 text-emerald-800 border-emerald-200",
  store: "bg-amber-100 text-amber-800 border-amber-200",
  mistake: "bg-red-100 text-red-800 border-red-200",
  general: "bg-slate-100 text-slate-800 border-slate-200",
};

type PageProps = { searchParams: { client?: string } };

export default async function AprendizajePage({ searchParams }: PageProps) {
  const [activeClient, clients] = await Promise.all([
    requirePageClient(prisma, searchParams.client),
    getVisibleClients(prisma),
  ]);

  const [memories, acceptedResponses] = await Promise.all([
    prisma.clientMemory.findMany({
      where: { clientId: activeClient.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.response.findMany({
      where: { acceptedAsCorrectAt: { not: null }, opportunity: { clientId: activeClient.id } },
      select: { id: true, draftText: true, editedText: true, acceptedAsCorrectAt: true, brand: { select: { name: true } }, opportunity: { select: { sourceText: true } } },
      orderBy: { acceptedAsCorrectAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-5 py-8 lg:px-8">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-brass">
            Memoria e Inteligencia del Sistema
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink md:text-5xl">
            Aprendizaje de la IA
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Acá podés consultar y gestionar la memoria aprendida para cada cliente a partir de los chats de refinamiento y aprobaciones de respuestas.
          </p>
        </div>

        <Link
          href="/oportunidades"
          className="rounded-full border border-ink/20 bg-white/60 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white"
        >
          ← Oportunidades
        </Link>
      </header>

      {clients.length > 1 ? <nav className="mb-6 flex flex-wrap gap-2" aria-label="Cliente a entrenar">
        {clients.map((client) => <Link key={client.id} href={`/aprendizaje?client=${encodeURIComponent(client.slug)}`} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${client.id === activeClient?.id ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white text-slate hover:border-ink/40"}`}>{client.name}</Link>)}
      </nav> : null}

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        {[["Reglas aprendidas", memories.length], ["Respuestas correctas", acceptedResponses.length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-ink/10 bg-white/75 p-4 shadow-panel"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate/60">{label}</p><p className="mt-2 font-display text-3xl text-ink">{value}</p></div>)}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Main Memories List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-ink">
              Reglas Aprendidas ({memories.length})
            </h2>
            <span className="text-xs text-slate/70">
              Cliente: <strong className="text-ink">{activeClient?.name}</strong>
            </span>
          </div>

          {memories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/20 bg-white/50 p-8 text-center text-slate">
              <p className="font-display text-lg text-ink">Aún no hay aprendizajes guardados</p>
              <p className="mt-1 text-xs">
                A medida que chatees con la IA en los borradores y apruebes respuestas, la IA extraerá y recordará automáticamente las reglas de {activeClient?.name}.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {memories.map((mem) => {
                const badgeStyle = CATEGORY_COLORS[mem.category] || CATEGORY_COLORS.general;
                return (
                  <article
                    key={mem.id}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-ink/10 bg-white p-5 shadow-panel backdrop-blur sm:flex-row sm:items-start"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}
                        >
                          {mem.category}
                        </span>
                        <span className="text-[11px] text-slate/60">
                          {mem.source.startsWith("copilot_feedback_") ? "Feedback del Copiloto" : mem.source === "chat_refinement" ? "Chat de refinamiento" : "Carga manual"}
                        </span>
                        <span className="text-[11px] text-slate/40">
                          • {new Date(mem.createdAt).toLocaleDateString("es-AR")}
                        </span>
                      </div>

                      <form action={updateClientMemoryAction} className="space-y-2">
                        <input type="hidden" name="memoryId" value={mem.id} />
                        <textarea name="rule" defaultValue={mem.rule} rows={3} className="w-full resize-y rounded-lg border border-ink/10 bg-paper/60 px-3 py-2 text-sm font-semibold leading-relaxed text-ink outline-none focus:border-ink" />
                        <button type="submit" className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink hover:border-ink/40">Guardar cambio</button>
                      </form>

                      {mem.summary && mem.summary !== mem.rule ? (
                        <p className="text-xs italic text-slate/70">
                          Resumen: {mem.summary}
                        </p>
                      ) : null}
                    </div>

                    <form
                      action={async () => {
                        "use server";
                        await deleteClientMemoryAction(mem.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 hover:text-red-900"
                        title="Eliminar esta regla de la memoria"
                      >
                        🗑️ Eliminar
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-6">
            <h2 className="font-display text-2xl text-ink">
              Respuestas correctas ({acceptedResponses.length})
            </h2>
            <span className="text-xs text-slate/70">Se usan como ejemplos al generar</span>
          </div>

          {acceptedResponses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/20 bg-white/50 p-8 text-center text-xs text-slate">
              Cuando aceptes una respuesta desde el chat del Copiloto CM, va a aparecer acá y la IA la va a tomar como referencia.
            </div>
          ) : (
            <div className="grid gap-3">
              {acceptedResponses.map((accepted) => (
                <article key={accepted.id} className="rounded-xl border border-ink/10 bg-white p-5 shadow-panel">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate/60">
                    <span>{accepted.brand.name} • {accepted.acceptedAsCorrectAt ? new Date(accepted.acceptedAsCorrectAt).toLocaleDateString("es-AR") : ""}</span>
                    <form action={unmarkAcceptedResponseAction}>
                      <input type="hidden" name="responseId" value={accepted.id} />
                      <button type="submit" className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100">Quitar de ejemplos</button>
                    </form>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate">Comentario: {accepted.opportunity.sourceText}</p>
                  <p className="mt-2 rounded-lg bg-moss/[0.06] px-3 py-2 text-sm leading-6 text-ink">{accepted.editedText || accepted.draftText}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar: Add Manual Rule */}
        <aside>
          <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-panel">
            <h3 className="font-display text-xl text-ink">Agregar Regla Manual</h3>
            <p className="mt-1 text-xs text-slate">
              Podés ingresar directamente una regla de tono, garantía o vocabulario para {activeClient?.name}.
            </p>

            <form action={createManualClientMemoryAction} className="mt-5 space-y-4">
              <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate/60">
                  Categoría
                </label>
                <select
                  name="category"
                  defaultValue="general"
                  className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-xs text-ink"
                >
                  <option value="general">General</option>
                  <option value="tone">Tono de voz / Estilo</option>
                  <option value="warranty">Garantía / Soporte</option>
                  <option value="product">Producto / Especificación</option>
                  <option value="store">Tienda / Cuotas / Stock</option>
                  <option value="mistake">Error a evitar</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate/60">
                  Regla o Preferencia
                </label>
                <textarea
                  name="rule"
                  rows={4}
                  required
                  placeholder="Ej: Para productos de la marca, remarcar siempre la garantía oficial de 6 meses y soporte técnico local..."
                  className="w-full rounded-lg border border-ink/15 bg-paper p-3 text-xs leading-relaxed text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <SubmitButton
                loadingText="Guardando..."
                className="w-full rounded-xl bg-ink px-4 py-3 text-xs font-bold text-paper transition hover:bg-slate-850"
              >
                Guardar en Memoria
              </SubmitButton>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteClientMemoryAction, createManualClientMemoryAction } from "../opportunities/actions";
import { SubmitButton } from "../opportunities/[id]/SubmitButton";

type PageProps = {
  searchParams?: { client?: string };
};

const CATEGORY_COLORS: Record<string, string> = {
  tone: "bg-purple-100 text-purple-800 border-purple-200",
  warranty: "bg-blue-100 text-blue-800 border-blue-200",
  product: "bg-emerald-100 text-emerald-800 border-emerald-200",
  store: "bg-amber-100 text-amber-800 border-amber-200",
  general: "bg-slate-100 text-slate-800 border-slate-200",
};

export default async function AprendizajePage({ searchParams }: PageProps) {
  const clients = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const selectedSlug = searchParams?.client || clients[0]?.slug || "";
  const activeClient = clients.find((c) => c.slug === selectedSlug) || clients[0];

  const memories = activeClient
    ? await prisma.clientMemory.findMany({
      where: { clientId: activeClient.id, active: true },
      orderBy: { createdAt: "desc" },
    })
    : [];

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

      {/* Client Switcher Tabs */}
      <div className="mb-8 flex flex-wrap gap-3 border-b border-ink/10 pb-4">
        {clients.map((client) => {
          const isActive = client.id === activeClient?.id;
          return (
            <Link
              key={client.id}
              href={`/aprendizaje?client=${client.slug}`}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${isActive
                  ? "bg-ink text-paper shadow-md"
                  : "border border-ink/10 bg-white/80 text-ink/80 hover:bg-white hover:text-ink"
                }`}
            >
              {client.name}
            </Link>
          );
        })}
      </div>

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
                          {mem.source === "chat_refinement" ? "🤖 Chat de refinamiento" : "✍️ Carga manual"}
                        </span>
                        <span className="text-[11px] text-slate/40">
                          • {new Date(mem.createdAt).toLocaleDateString("es-AR")}
                        </span>
                      </div>

                      <p className="break-words text-sm font-semibold leading-relaxed text-ink">
                        `{mem.rule}`
                      </p>

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

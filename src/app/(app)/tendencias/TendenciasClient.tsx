"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, Trend } from "@prisma/client";

type Props = { activeClient: Client; clients: Client[]; signals: Trend[] };
type Filter = "all" | "news" | "media" | "data";

const SOURCE_LABEL: Record<string, string> = {
  GOOGLE_NEWS: "Noticias",
  ARGENTINE_PRESS: "Prensa argentina",
  ARGENTINE_STREAMING_MEDIA: "Streaming",
  ARGENTINA_DATA: "Datos públicos",
  URL_ARTICLE: "Artículo",
  PODCAST: "Podcast",
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "news", label: "Noticias y prensa" },
  { value: "media", label: "Streaming y audio" },
  { value: "data", label: "Datos" },
];

function filterFor(platform: string): Filter {
  if (["GOOGLE_NEWS", "ARGENTINE_PRESS", "URL_ARTICLE"].includes(platform)) return "news";
  if (["ARGENTINE_STREAMING_MEDIA", "PODCAST"].includes(platform)) return "media";
  return "data";
}

function cleanTitle(title: string) {
  return title.replace(/^(Coyuntura|Google Trend|X\/Twitter Trend):\s*/i, "");
}

function sourceName(signal: Trend) {
  const metadata = signal.metadata && typeof signal.metadata === "object" ? signal.metadata as Record<string, unknown> : {};
  return typeof metadata.outlet === "string" && metadata.outlet ? metadata.outlet : SOURCE_LABEL[signal.platform] ?? signal.platform.replaceAll("_", " ");
}

function ageLabel(date: Date) {
  const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export default function TendenciasClient({ activeClient, clients, signals }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = useMemo(() => filter === "all" ? signals : signals.filter((signal) => filterFor(signal.platform) === filter), [filter, signals]);

  return <div className="min-h-screen bg-paper text-ink"><main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
    <header className="relative overflow-hidden rounded-2xl border border-ink/10 bg-[#17231e] px-5 py-7 text-paper shadow-panel sm:px-8 sm:py-9">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-moss/35 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-brass">Radar de Cafishia · {activeClient.name}</p><h1 className="mt-3 font-display text-4xl font-bold leading-none sm:text-5xl">Tendencias</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-paper/75">Coyuntura relevante para entender qué está pasando alrededor del rubro del cliente. Fuentes para inspirar criterio, no para subirse automáticamente a cualquier tema.</p></div><select value={activeClient.slug} onChange={(event) => router.push(`/tendencias?client=${event.target.value}`)} className="h-11 w-full rounded-md border border-paper/20 bg-white/10 px-3 text-sm font-bold text-paper lg:w-auto lg:min-w-52">{clients.map((client) => <option className="text-ink" key={client.id} value={client.slug}>{client.name}</option>)}</select></div>
      <div className="relative mt-7 flex flex-wrap gap-2 text-xs font-bold text-paper/70"><span className="rounded-full border border-paper/15 bg-white/10 px-3 py-1.5">{signals.length} señales</span><span className="rounded-full border border-paper/15 bg-white/10 px-3 py-1.5">Últimos 14 días</span><span className="rounded-full border border-paper/15 bg-white/10 px-3 py-1.5">Revisión editorial humana</span></div>
    </header>

    <section className="mt-8"><div className="flex flex-col gap-4 border-b border-ink/10 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-moss">Señales de coyuntura</p><h2 className="mt-1 font-display text-3xl font-bold">Lo que puede mover la conversación</h2></div><div className="flex gap-1 overflow-x-auto">{FILTERS.map((item) => <button key={item.value} onClick={() => setFilter(item.value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black transition ${filter === item.value ? "bg-ink text-paper" : "border border-ink/15 text-slate hover:border-ink/40 hover:text-ink"}`}>{item.label}</button>)}</div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((signal, index) => <article key={signal.id} className="group rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-moss/50 hover:shadow-panel" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-moss/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.13em] text-moss">{SOURCE_LABEL[signal.platform] ?? "Fuente"}</span><span className="text-[11px] font-bold text-slate/55">{ageLabel(signal.createdAt)}</span></div><h3 className="mt-4 font-display text-xl font-bold leading-tight">{cleanTitle(signal.title)}</h3><p className="mt-3 line-clamp-4 text-sm leading-6 text-slate">{signal.description}</p><div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/8 pt-3"><span className="truncate text-[10px] font-black uppercase tracking-[.12em] text-slate/55">{sourceName(signal)}</span>{signal.sourceUrl ? <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-black text-ink underline decoration-moss/50 underline-offset-4 transition group-hover:text-moss">Abrir fuente ↗</a> : null}</div></article>)}</div>{filtered.length === 0 && <div className="rounded-2xl border border-dashed border-ink/20 bg-white/60 px-6 py-14 text-center"><p className="font-display text-2xl font-bold">Todavía no hay señales de este tipo</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate">Cafishia las incorpora en cada corrida del radar cuando encuentra fuentes públicas relacionadas con {activeClient.name}.</p></div>}</section>
    <p className="mt-8 text-xs leading-5 text-slate/60">Las señales pueden ser sensibles o necesitar contexto adicional. Verificá siempre la fuente antes de convertir una tendencia en contenido o respuesta.</p>
  </main></div>;
}

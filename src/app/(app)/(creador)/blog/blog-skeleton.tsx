import { LoadingSpinner } from "@/components/loading-ui";

type Section = "articles" | "calendar" | "sources" | "design" | "settings" | "editor";

const messages: Record<Section, string> = {
  articles: "Cargando artículos…",
  calendar: "Cargando calendario editorial…",
  sources: "Cargando fuentes revisadas…",
  design: "Cargando diseño del blog…",
  settings: "Cargando configuración del blog…",
  editor: "Preparando editor del artículo…",
};

function Lines() {
  return <div className="space-y-3"><div className="loading-block h-4 w-3/4" /><div className="loading-block h-3 w-full" /><div className="loading-block h-3 w-2/3" /></div>;
}

function Fields() {
  return <div className="space-y-5 rounded-xl border border-ink/10 bg-paper p-6">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><div className="loading-block h-3 w-28" /><div className="loading-block h-11 w-full" /></div>)}<div className="loading-block h-10 w-40 rounded-full" /></div>;
}

export function BlogSkeleton({ section = "articles" }: { section?: Section }) {
  return <div role="status" aria-live="polite" aria-busy="true" className={`mx-auto w-full px-5 py-8 ${section === "editor" ? "max-w-6xl" : "max-w-5xl"}`}>
    <div className="loading-reveal space-y-6">
      <div className="loading-page-indicator"><LoadingSpinner className="loading-spinner-page" /><span>{messages[section]}</span></div>
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-3"><div className="loading-block h-9 w-80 max-w-full" /><div className="loading-block h-3 w-96 max-w-full" /></div>
        {section === "calendar" ? <>
          <div className="space-y-5 rounded-2xl border border-ink/10 bg-paper p-6"><div className="loading-block h-8 w-64 max-w-full" /><div className="flex gap-3"><div className="loading-block h-7 w-28 rounded-full" /><div className="loading-block h-7 w-24 rounded-full" /></div></div>
          <div className="overflow-hidden rounded-2xl border border-ink/10 bg-paper"><div className="flex items-center justify-between border-b border-ink/10 p-5"><div className="loading-block h-6 w-40" /><div className="loading-block h-8 w-20" /></div><div className="overflow-x-auto"><div className="grid min-w-[840px] grid-cols-7">{Array.from({ length: 35 }, (_, i) => <div key={i} className="min-h-48 space-y-5 border-b border-r border-ink/10 p-3"><div className="loading-block h-4 w-6" />{i % 3 === 0 ? <Lines /> : null}</div>)}</div></div></div>
        </> : section === "settings" ? <div className="grid gap-8 lg:grid-cols-2"><Fields /><Fields /></div>
        : section === "design" ? <><div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-4 rounded-xl border border-ink/10 bg-paper p-4"><div className="loading-block h-32 w-full" /><div className="loading-block h-4 w-3/4" /></div>)}</div><Fields /></>
        : section === "editor" ? <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-8 rounded-2xl border border-ink/10 bg-paper p-6"><div className="loading-block h-12 w-full" />{Array.from({ length: 5 }, (_, i) => <Lines key={i} />)}</div><Fields /></div>
        : <>{section === "sources" ? <Fields /> : <div className="flex flex-wrap gap-3 border-b border-ink/10 pb-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="loading-block h-9 w-28" />)}</div>}{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-4 rounded-xl border border-ink/10 bg-paper p-5"><div className="flex gap-2"><div className="loading-block h-5 w-24 rounded-full" /><div className="loading-block h-5 w-20 rounded-full" /></div><Lines /><div className="flex justify-end gap-2"><div className="loading-block h-8 w-24" /><div className="loading-block h-8 w-24" /></div></div>)}</>}
      </div>
    </div>
  </div>;
}

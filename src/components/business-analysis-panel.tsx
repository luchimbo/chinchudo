"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_MARKET, type AnalysisResult, type BusinessMarket, type BusinessProfileData } from "@/lib/business-analysis";

type Tab = "business" | "competitors" | "seo";
type View = {
  profile: { data: BusinessProfileData; sourceUrl: string; monthlyEnabled: boolean; lastSuccessfulAt: string | null; nextAnalysisAt: string | null } | null;
  competitors: Array<{ id: string; domain: string; excluded: boolean; reason: string; sourceUrl: string }>;
  run: { id: string; status: string; stage: string; errors: string[]; result: AnalysisResult } | null;
  publications: Array<{ id: string; scheduledDate: string; targetKeyword: string; plannedTitle: string; status: string; lastError: string; requiresApproval: boolean; landing: { id: string; titulo: string; keyword: string } | null }>;
};
const input = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20";
const button = "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-40 hover:bg-moss";
const labels: Record<string, string> = { QUEUED: "Análisis en espera", RUNNING: "Analizando", PARTIAL: "Completado con pendientes", COMPLETED: "Completado", FAILED: "Requiere atención" };
const stages: Record<string, string> = { website: "Leyendo tu web", competitors: "Comparando competidores", articles: "Preparando tu semana de artículos", done: "Análisis finalizado" };
const lines = (value: string) => value.split("\n").map(s => s.trim()).filter(Boolean);

export function BusinessAnalysisPanel({ clientSlug, initialTab = "business", embedded = false }: { clientSlug: string; initialTab?: Tab; embedded?: boolean }) {
  const [view, setView] = useState<View | null>(null), [tab, setTab] = useState<Tab>(initialTab);
  const [url, setUrl] = useState(""), [domain, setDomain] = useState("");
  const [description, setDescription] = useState(""), [offer, setOffer] = useState(""), [audience, setAudience] = useState("");
  const [priorities, setPriorities] = useState<string[]>([]), [exclusions, setExclusions] = useState(""), [differentiators, setDifferentiators] = useState("");
  const [market, setMarket] = useState<BusinessMarket>({ ...DEFAULT_MARKET });
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dirtyFields = useRef(new Set<string>());
  const [urlDirty, setUrlDirty] = useState(false);
  const markDirty = (field: string) => { dirtyFields.current.add(field); setDirty(true); };
  const polling = !!view?.run && ["QUEUED", "RUNNING"].includes(view.run.status);
  const endpoint = `/api/business-analysis?client=${encodeURIComponent(clientSlug)}`;
  const refresh = useCallback(async () => {
    const response = await fetch(endpoint);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo cargar el análisis.");
    setView(data);
  }, [endpoint]);
  useEffect(() => {
    let disposed = false;
    const load = () => { if (!disposed) void refresh().catch(e => setError(e.message)); };
    load(); const timer = polling ? window.setInterval(load, 5000) : undefined;
    return () => { disposed = true; if (timer) window.clearInterval(timer); };
  }, [refresh, polling]);
  useEffect(() => {
    if (!view?.profile || dirty) return;
    const profile = view.profile, data = profile.data;
    if (!urlDirty) setUrl(profile.sourceUrl); setDescription(data.draft.description); setOffer(data.draft.offer); setAudience(data.draft.targetAudience);
    setPriorities(data.priorities); setExclusions(data.exclusions.join("\n")); setDifferentiators(data.differentiators.join("\n")); setMarket(data.market);
  }, [view, dirty, urlDirty]);
  async function mutate(method: "POST" | "PATCH", body: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      await refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); return false; }
    finally { setBusy(false); }
  }
  const changes = () => {
    const fields: Record<string, unknown> = { description, offer, targetAudience: audience, priorities: priorities.map(v => v.trim()).filter(Boolean), exclusions: lines(exclusions), differentiators: lines(differentiators), market };
    return { profile: Object.fromEntries([...dirtyFields.current].map(field => [field, fields[field]])) };
  };
  async function save() {
    if (await mutate("PATCH", changes())) { dirtyFields.current.clear(); setDirty(false); setNotice("Perfil guardado y aplicado al contexto del negocio."); }
  }
  async function start() {
    if (dirty && !(await mutate("PATCH", changes()))) return;
    if (await mutate("POST", { sourceUrl: url, market })) { setDirty(false); setNotice("Análisis en cola. Podés seguir usando el panel mientras se prepara."); }
  }
  const active = !!view?.run && ["QUEUED", "RUNNING"].includes(view.run.status);
  const sites = [view?.run?.result.own, ...(view?.run?.result.competitors || []).filter(site => !view?.competitors.find(c => c.domain === site.domain)?.excluded)].filter((site): site is NonNullable<typeof site> => !!site);
  const date = (value: string) => new Date(value).toLocaleDateString("es-AR", { timeZone: "UTC" });
  const editMarket = (field: keyof BusinessMarket, value: string) => { setMarket({ ...market, [field]: value }); markDirty("market"); };
  return <section className={embedded ? "space-y-5" : "mx-auto w-full max-w-6xl space-y-6 px-5 py-8"}>
    {!embedded ? <header><p className="text-xs font-semibold uppercase tracking-widest text-moss">Tu negocio, con contexto</p><h1 className="mt-2 font-display text-3xl text-ink">Inteligencia de negocio</h1><p className="mt-2 text-sm text-slate">Entendé tu oferta, compará competidores y prepará contenido útil.</p></header> : null}
    <nav aria-label="Análisis del negocio" className="flex flex-wrap gap-2 border-b border-ink/10 pb-3">
      {([["business", "Mi negocio"], ["competitors", "Competidores"], ["seo", "SEO y oportunidades"]] as const).map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? "bg-ink text-paper" : "bg-ink/5 text-slate hover:bg-ink/10"}`}>{label}</button>)}
      {!embedded ? <Link href={`/geo?client=${encodeURIComponent(clientSlug)}&tab=ias`} className="rounded-full px-4 py-2 text-sm font-semibold text-slate">Presencia en IAs</Link> : null}
    </nav>
    {error ? <p role="alert" className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-signal">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-moss/20 bg-moss/5 p-4 text-sm text-moss">{notice}</p> : null}
    <div className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink">{view?.run ? labels[view.run.status] : "Empezá por tu sitio"}</p><p aria-live="polite" className="mt-1 text-xs text-slate">{view?.run ? stages[view.run.stage] : "La lectura prepara el perfil y una semana de borradores."}</p></div><div className="flex gap-2"><button type="button" disabled={busy || active} onClick={() => void start()} className={button}>{view?.profile?.lastSuccessfulAt ? "Actualizar análisis" : "Iniciar análisis"}</button>{view?.run && ["PARTIAL", "FAILED"].includes(view.run.status) ? <button type="button" disabled={busy} onClick={() => void mutate("POST", { action: "retry", runId: view.run!.id })} className="text-sm font-semibold text-moss underline">Reintentar pendientes</button> : null}</div></div>
      {view?.run?.errors?.length ? <details className="mt-3 text-xs text-slate"><summary className="cursor-pointer">Ver pendientes ({view.run.errors.length})</summary><ul className="mt-2 space-y-1">{view.run.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></details> : null}
      {view?.run?.result.changes?.length ? <details className="mt-3 text-xs text-slate"><summary className="cursor-pointer">Cambios aplicados</summary><ul className="mt-2 space-y-1">{view.run.result.changes.map((change, index) => <li key={index}>{change}</li>)}</ul></details> : null}
      {active ? <p className="mt-3 text-xs text-slate">Podés seguir usando el panel. El progreso se guarda aunque cierres esta página.</p> : null}
    </div>
    {tab === "business" ? <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4 rounded-2xl border border-ink/10 bg-white p-5">
        <h2 className="font-display text-xl text-ink">Lo que sabemos de tu negocio</h2><p className="text-xs text-slate">Los resúmenes y el público pueden incluir sugerencias de IA. Tus correcciones tienen prioridad en futuras lecturas.</p>
        <label className="grid gap-1 text-xs font-semibold text-slate">Web (opcional)<input className={input} value={url} onChange={e => { setUrl(e.target.value); setUrlDirty(true); }} placeholder="https://tutienda.com" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate">Descripción<textarea rows={3} className={input} value={description} onChange={e => { setDescription(e.target.value); markDirty("description"); }} /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate">Oferta principal<input className={input} value={offer} onChange={e => { setOffer(e.target.value); markDirty("offer"); }} /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate">Público objetivo<input className={input} value={audience} onChange={e => { setAudience(e.target.value); markDirty("targetAudience"); }} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-slate">País<input className={input} value={market.country} onChange={e => editMarket("country", e.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-slate">Idioma<input className={input} value={market.language} onChange={e => editMarket("language", e.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-slate">Alcance<select className={input} value={market.reach} onChange={e => editMarket("reach", e.target.value)}><option value="national">Nacional</option><option value="local">Local</option></select></label><label className="grid gap-1 text-xs font-semibold text-slate">Zona horaria<input className={input} value={market.timezone} onChange={e => editMarket("timezone", e.target.value)} /></label>{market.reach === "local" ? <label className="grid gap-1 text-xs font-semibold text-slate">Ciudad o zona<input className={input} value={market.city} onChange={e => editMarket("city", e.target.value)} /></label> : null}</div>
        <label className="grid gap-1 text-xs font-semibold text-slate">Diferenciales (uno por línea)<textarea rows={3} className={input} value={differentiators} onChange={e => { setDifferentiators(e.target.value); markDirty("differentiators"); }} /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate">Lo que no vendés / temas a excluir<textarea rows={3} className={input} value={exclusions} onChange={e => { setExclusions(e.target.value); markDirty("exclusions"); }} /><span className="font-normal">Se usa en contenido y escucha. No inferimos exclusiones por ausencia en la web.</span></label>
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className={button}>Guardar correcciones</button>
        <p className="text-xs text-slate">El análisis se aplica automáticamente. Tus correcciones tienen prioridad en futuras lecturas.</p>
      </div>
      <div className="space-y-5"><div className="rounded-2xl border border-moss/20 bg-moss/5 p-5"><h2 className="font-display text-xl text-ink">Prioridades comerciales</h2><p className="mt-1 text-xs text-slate">Ordená lo que querés destacar. Este orden no representa ventas medidas.</p><div className="mt-4 space-y-2">{priorities.map((name, index) => <div className="flex items-center gap-2" key={index}><input aria-label={`Prioridad ${index + 1}`} className={input} value={name} onChange={e => { setPriorities(priorities.map((v, i) => i === index ? e.target.value : v)); markDirty("priorities"); }} /><button aria-label={`Subir ${name}`} disabled={!index} type="button" onClick={() => { const next = [...priorities]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setPriorities(next); markDirty("priorities"); }} className="px-2 text-ink disabled:opacity-30">↑</button><button aria-label={`Quitar ${name}`} type="button" onClick={() => { setPriorities(priorities.filter((_, i) => i !== index)); markDirty("priorities"); }} className="px-2 text-signal">×</button></div>)}</div><button type="button" onClick={() => { setPriorities([...priorities, "Nueva prioridad"]); markDirty("priorities"); }} className="mt-3 text-sm font-semibold text-moss">+ Agregar prioridad</button></div>
      <div className="rounded-2xl border border-ink/10 bg-paper p-5"><h2 className="font-display text-xl text-ink">Catálogo detectado</h2><p className="mt-1 text-xs text-slate">Muestra de las páginas examinadas, no inventario completo.</p><div className="mt-3 space-y-2">{view?.profile?.data.draft.offerings.filter(o => o.selected).slice(0, 12).map(o => <div className="border-b border-ink/5 pb-2 text-sm" key={o.id}><span className="font-semibold text-ink">{o.name}</span><p className="text-xs text-slate">{o.kind === "service" ? "Servicio" : "Producto"} · {o.category || "Sin categoría"} · {o.evidence.status === "manual" ? "Manual" : o.evidence.status === "needs_confirmation" ? "No observado en esta lectura · revisar" : "Extraído"}</p>{/^https?:\/\//.test(o.url) ? <a className="text-xs text-moss underline" href={o.url} target="_blank" rel="noreferrer">Ver fuente</a> : null}</div>)}</div><Link className="mt-3 inline-block text-sm font-semibold text-moss underline" href={`/onboarding?client=${encodeURIComponent(clientSlug)}&step=1`}>Editar productos y servicios</Link></div>
      <div className="rounded-2xl border border-ink/10 bg-paper p-5"><label className="flex gap-2 text-sm text-ink"><input type="checkbox" checked={view?.profile?.monthlyEnabled ?? true} disabled={busy || !view?.profile} onChange={e => void mutate("PATCH", { monthlyEnabled: e.target.checked })} />Actualizar mensualmente</label>{view?.profile?.nextAnalysisAt ? <p className="mt-2 text-xs text-slate">Próxima lectura: {date(view.profile.nextAnalysisAt)}</p> : null}</div></div>
    </div> : null}
    {tab === "competitors" ? <div className="space-y-4">
      {sites.length ? <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white"><table className="w-full min-w-[650px] text-left text-xs"><caption className="p-4 text-left text-sm font-semibold text-ink">Oferta y temas de las páginas examinadas</caption><thead className="border-y border-ink/10 bg-paper text-slate"><tr>{["Negocio", "Categorías observadas", "Público sugerido", "Temas observados"].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{sites.map((site, index) => <tr key={site.domain} className="border-b border-ink/5 align-top"><th scope="row" className="px-4 py-3 font-semibold text-ink">{site.domain}{!index ? <span className="block font-normal text-moss">Tu negocio</span> : null}</th><td className="px-4 py-3 text-slate">{site.categories.join(" · ") || "Sin evidencia suficiente"}</td><td className="px-4 py-3 text-slate">{site.audience || "Por confirmar"}</td><td className="px-4 py-3 text-slate">{site.topics.join(" · ") || "Sin evidencia suficiente"}</td></tr>)}</tbody></table><p className="p-4 text-xs text-slate">El público es una interpretación. Que una oferta no aparezca en la muestra no demuestra que el negocio no la venda.</p></div> : null}<div><h2 className="font-display text-xl text-ink">Con quién compite tu oferta</h2><p className="mt-1 text-sm text-slate">Candidatos por coincidencia de oferta y mercado. Podés corregir la selección.</p></div><form className="flex max-w-xl gap-3" onSubmit={e => { e.preventDefault(); void mutate("PATCH", { competitor: { domain } }).then(ok => { if (ok) { setDomain(""); setNotice("Competidor agregado. Actualizá el análisis para comparar su web."); } }); }}><input required aria-label="Dominio del competidor" className={input} value={domain} onChange={e => setDomain(e.target.value)} placeholder="competidor.com" /><button disabled={busy} className={button}>Agregar</button></form>{!view?.competitors.length ? <p className="rounded-xl border border-dashed border-ink/20 p-5 text-sm text-slate">Todavía no hay competidores. Iniciá un análisis o agregá dominios conocidos.</p> : null}<div className="grid gap-4 md:grid-cols-2">{view?.competitors.map(c => <article key={c.id} className={`rounded-2xl border border-ink/10 p-5 ${c.excluded ? "bg-ink/5 opacity-70" : "bg-white"}`}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">{c.domain}</h3><button type="button" disabled={busy} onClick={() => void mutate("PATCH", { competitor: { domain: c.domain, excluded: !c.excluded } })} className="text-xs font-semibold text-signal underline">{c.excluded ? "Restaurar" : "Quitar"}</button></div><p className="mt-2 text-xs text-slate">{c.reason}</p>{c.excluded ? <p className="mt-2 text-xs text-slate">Excluido de futuras detecciones.</p> : <>{/^https?:\/\//.test(c.sourceUrl) ? <a className="mt-2 inline-block text-xs text-moss underline" href={c.sourceUrl} target="_blank" rel="noreferrer">Fuente de selección</a> : null}{sites.filter(s => s.domain === c.domain).map(site => <div key={site.domain} className="mt-3 border-t border-ink/10 pt-3 text-xs text-slate"><p>{site.offer || site.description}</p><p className="mt-2">Categorías observadas: {site.categories.join(" · ") || "Sin evidencia suficiente"}</p><p className="mt-1">Público sugerido: {site.audience || "Por confirmar"}</p><p className="mt-2">{site.pages.length} páginas examinadas</p></div>)}</>}</article>)}</div></div> : null}
    {tab === "seo" ? <div className="space-y-6"><div><h2 className="font-display text-xl text-ink">SEO de las páginas examinadas</h2><p className="mt-1 text-sm text-slate">{view?.run?.result.pagesRead || 0} páginas leídas. Los hallazgos describen esta muestra; no miden tráfico ni autoridad.</p></div>{sites.map(site => <details key={site.domain} className="rounded-2xl border border-ink/10 bg-white p-5"><summary className="cursor-pointer font-semibold text-ink">{site.domain} · {site.pages.length} páginas</summary><div className="mt-4 space-y-4">{site.pages.map(page => <div className="border-t border-ink/10 pt-3" key={page.url}><a className="break-all text-sm font-semibold text-moss underline" href={page.url} target="_blank" rel="noreferrer">{page.title || page.url}</a><p className="mt-1 text-xs text-slate">Leída: {date(page.fetchedAt)} · JSON-LD: {page.seo?.structuredTypes.join(", ") || "No detectado"}</p>{page.seo?.findings.length ? <ul className="mt-2 space-y-2">{page.seo.findings.map((f, index) => <li className="text-xs text-slate" key={index}><strong className="text-ink">{f.field}: {f.evidence}</strong> — {f.recommendation}</li>)}</ul> : <p className="mt-2 text-xs text-moss">Sin observaciones en las comprobaciones realizadas.</p>}</div>)}</div></details>)}<h2 className="font-display text-xl text-ink">Oportunidades de contenido</h2><p className="text-xs text-slate">Sugerencias de IA basadas en la oferta y las páginas leídas. No representan volumen de búsquedas medido.</p><div className="grid gap-3 md:grid-cols-2">{view?.run?.result.opportunities?.map(topic => <div key={topic.keyword} className="rounded-xl border border-brass/20 bg-brass/5 p-4"><h3 className="text-sm font-semibold text-ink">{topic.title}</h3><p className="mt-1 text-xs text-slate">{topic.keyword}</p><p className="mt-2 text-xs text-slate">{topic.reason}</p></div>)}</div><div className="rounded-2xl border border-ink/10 bg-paper p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl text-ink">Tu semana de artículos</h2><Link className="text-sm font-semibold text-moss underline" href={`/blog/calendario?client=${encodeURIComponent(clientSlug)}`}>Abrir calendario</Link></div><p className="mt-1 text-xs text-slate">Un día por artículo desde la fecha del análisis. Los borradores requieren revisión humana.</p><div className="mt-4 divide-y divide-ink/10">{view?.publications.map(slot => <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={slot.id}><div><p className="font-semibold text-ink">{date(slot.scheduledDate)} · {slot.landing?.titulo || slot.plannedTitle || (slot.status === "SKIPPED" ? "Fecha omitida" : "Pendiente de preparación")}</p><p className="text-xs text-slate">{slot.landing?.keyword || slot.targetKeyword || slot.lastError || "Preparando un tema respaldado"}</p></div>{slot.landing ? <Link className="text-xs font-semibold text-moss underline" href={`/blog/articulos/${slot.landing.id}?client=${encodeURIComponent(clientSlug)}`}>Revisar borrador</Link> : null}</div>)}</div></div></div> : null}
  </section>;
}

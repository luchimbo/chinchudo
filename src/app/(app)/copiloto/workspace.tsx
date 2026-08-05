"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { discardCopilotOpportunity, generateCopilotDrafts, markCopilotResponse, teachCopilotFromResponse } from "@/app/(app)/opportunities/actions";

type Response = { id: string; text: string; variantType: string; isPrimary: boolean; persona: string };
type Opportunity = { id: string; text: string; author: string; sourceUrl: string; channel: string; brand: string; product: string; createdAt: string; status: string; responses: Response[] };
type PulseSignal = { id: string; title: string; description: string; sourceUrl: string; platform: string; createdAt: string; reason: string; allowHumor: boolean };

function cleanPreview(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function PendingSubmit({ children, pendingLabel, className }: { children: React.ReactNode; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>{pending ? pendingLabel : children}</button>;
}

function ResponseCard({ response, opportunityId, sourceUrl }: { response: Response; opportunityId: string; sourceUrl: string }) {
  const [text, setText] = useState(response.text);
  const [copied, setCopied] = useState(false);
  const [openingSource, setOpeningSource] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function openForPublishing() {
    setOpeningSource(true);
    const target = window.open(sourceUrl, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } finally {
      setOpeningSource(false);
      if (!target) window.location.assign(sourceUrl);
    }
  }

  return <div className={`rounded-xl border p-4 ${response.isPrimary ? "border-moss/45 bg-moss/[0.05]" : "border-ink/10 bg-white"}`}>
    <form action={markCopilotResponse}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="responseId" value={response.id} />
      <input type="hidden" name="wasEdited" value={text.trim() !== response.text.trim() ? "true" : "false"} />
      <div className="mb-3 flex items-center justify-between gap-3"><span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink">Propuesta lista para editar</span><span className="text-[11px] font-medium text-slate/65">{response.persona}</span></div>
      <textarea name="editedText" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} rows={4} className="w-full resize-y rounded-lg border border-ink/10 bg-paper/65 px-3 py-2.5 text-sm leading-6 text-ink outline-none transition focus:border-brass" />
      <p className="mt-1 text-right text-[11px] text-slate/60">{text.length}/280</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-full border border-ink/15 px-3 py-2 text-xs font-bold text-ink transition hover:border-ink/40">{copied ? "Copiado" : "Copiar"}</button>
        <PendingSubmit pendingLabel="Guardando..." className="rounded-full bg-ink px-3 py-2 text-xs font-bold text-paper transition hover:bg-slate">Guardar como respondida</PendingSubmit>
        <button type="button" onClick={openForPublishing} disabled={openingSource} className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85 disabled:cursor-wait disabled:opacity-60">{openingSource ? "Copiando y abriendo..." : "Abrir para publicar"}</button>
      </div>
    </form>
    <div className="mt-4 border-t border-ink/10 pt-3"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate/60">Enseñarle a esta marca</p><div className="mt-2 flex flex-wrap gap-1.5">
      {[['SIRVIO', 'Sirvió'], ['MAS_DIRECTO', 'Más directo'], ['MENOS_VENTA', 'Menos venta'], ['MENOS_HUMOR', 'Menos humor'], ['TEMA_SENSIBLE', 'Tema sensible'], ['NO_APORTO', 'No aportó']].map(([feedback, label]) => <form key={feedback} action={teachCopilotFromResponse}><input type="hidden" name="opportunityId" value={opportunityId} /><input type="hidden" name="responseId" value={response.id} /><input type="hidden" name="feedback" value={feedback} /><PendingSubmit pendingLabel="Guardando..." className="rounded-full border border-ink/12 bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-slate transition hover:border-ink/40 hover:text-ink">{label}</PendingSubmit></form>)}
    </div></div>
  </div>;
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const date = new Date(opportunity.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const responses = useMemo(() => [...opportunity.responses].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)), [opportunity.responses]);
  const response = responses[0];

  return <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white/85 shadow-panel">
    <div className="border-b border-ink/10 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate/70"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-ink/7 px-2.5 py-1 text-ink">{opportunity.channel}</span><span>{opportunity.brand}</span>{opportunity.product ? <span className="text-slate/50">{opportunity.product}</span> : null}</div><span>{date}</span></div><p className="mt-4 max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-ink">{cleanPreview(opportunity.text)}</p><div className="mt-4 flex flex-wrap gap-2"><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink/40">Abrir fuente</a>{opportunity.author ? <span className="px-2 py-1.5 text-xs text-slate/65">{opportunity.author}</span> : null}<Link href={`/opportunities/${opportunity.id}`} className="px-2 py-1.5 text-xs font-semibold text-slate/65 underline decoration-slate/25 underline-offset-4 hover:text-ink">Ver detalle</Link></div></div>
    <div className="px-5 py-5">
      {!response ? <form action={generateCopilotDrafts} className="rounded-xl bg-paper p-4"><input type="hidden" name="opportunityId" value={opportunity.id} /><p className="text-sm leading-6 text-slate">El Copiloto lee el contexto y adapta el tono: directo, con onda o con cuidado según corresponda.</p><PendingSubmit pendingLabel="Leyendo contexto..." className="mt-4 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-slate">Generar propuesta</PendingSubmit></form> : <div className="max-w-3xl"><ResponseCard response={response} opportunityId={opportunity.id} sourceUrl={opportunity.sourceUrl} /></div>}
      <div className="mt-4">{discardOpen ? <form action={discardCopilotOpportunity} className="flex flex-wrap items-center gap-2 rounded-xl border border-signal/20 bg-signal/[0.04] p-3"><input type="hidden" name="opportunityId" value={opportunity.id} /><select name="reason" defaultValue="NO_RELEVANTE" className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-xs text-ink"><option value="NO_RELEVANTE">No era relevante</option><option value="NO_ES_EL_TONO">No era el tono</option><option value="FALTA_INFO">Faltaba información</option><option value="NO_CONVIENE">No conviene responder</option></select><PendingSubmit pendingLabel="Descartando..." className="rounded-full bg-signal px-3 py-2 text-xs font-bold text-white">Confirmar descarte</PendingSubmit><button type="button" onClick={() => setDiscardOpen(false)} className="px-2 py-2 text-xs font-semibold text-slate">Cancelar</button></form> : <button type="button" onClick={() => setDiscardOpen(true)} className="text-xs font-semibold text-slate/65 underline decoration-slate/30 underline-offset-4 hover:text-signal">Descartar oportunidad</button>}</div>
    </div>
  </article>;
}

function PulseCard({ signal }: { signal: PulseSignal }) {
  const kind = signal.platform === "GOOGLE_NEWS" ? "Coyuntura" : signal.platform === "ARGENTINE_STREAMING_MEDIA" ? "Medios argentinos" : signal.platform === "ARGENTINE_PRESS" ? "Diarios argentinos" : signal.platform === "ARGENTINA_DATA" ? "Datos de Argentina" : signal.platform === "X_CONVERSATION" ? "Conversación en X" : "Tendencia";
  return <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-brass/20 bg-white/75 p-3 transition hover:border-brass/60"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brass">{kind}</p><p className="mt-1 text-sm font-bold leading-5 text-ink">{signal.title.replace(/^(Coyuntura|Google Trend|X\/Twitter Trend):\s*/i, "")}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate">{signal.description}</p><p className="mt-2 text-[11px] leading-4 text-slate/70">{signal.allowHumor ? "Puede servir para un guiño leve." : signal.reason}</p></a>;
}

export function CopilotWorkspace({ activeClient, activeView, filters, pulse, opportunities }: { activeClient: { slug: string; name: string } | null; activeView: "opportunities" | "pulse"; filters: { brands: { id: string; name: string }[]; channels: { id: string; name: string }[]; selectedBrand: string; selectedChannel: string }; pulse: PulseSignal[]; opportunities: Opportunity[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const setParam = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); value ? next.set(key, value) : next.delete(key); if (activeClient) next.set("client", activeClient.slug); router.push(`${pathname}?${next.toString()}`); };
  const tabs = [{ id: "opportunities", label: "Oportunidades encontradas" }, { id: "pulse", label: "Pulso de hoy" }] as const;

  return <div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8"><header className="grid gap-5 border-b border-ink/10 pb-7 md:grid-cols-[1fr_auto] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-moss">Beta privada</p><h1 className="mt-2 font-display text-4xl leading-none text-ink md:text-5xl">Copiloto CM</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate">Encontrá una oportunidad, elegí el objetivo y el tono. El resto lo resuelve la marca.</p></div><div className="rounded-2xl border border-moss/20 bg-moss/[0.06] px-4 py-3 text-sm text-ink"><span className="font-bold">{activeClient?.name ?? "Sin cliente"}</span><br /><span className="text-xs text-slate">La publicación siempre es manual.</span></div></header>
    <div className="mt-6 flex flex-wrap gap-2">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setParam("view", tab.id === "opportunities" ? "" : tab.id)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${activeView === tab.id ? "bg-ink text-paper" : "bg-white/65 text-slate hover:text-ink"}`}>{tab.label}</button>)}</div>
    {activeView === "opportunities" ? <><div className="mt-5 flex flex-wrap gap-3 rounded-2xl border border-ink/10 bg-white/65 p-3"><label className="text-xs font-bold text-slate/70">Marca<select value={filters.selectedBrand} onChange={(event) => setParam("brand", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option>{filters.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="text-xs font-bold text-slate/70">Red<select value={filters.selectedChannel} onChange={(event) => setParam("channel", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option>{filters.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label></div><section className="mt-5 grid gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-moss">Para revisar hoy</p><h2 className="mt-1 font-display text-2xl text-ink">Oportunidades encontradas</h2></div>{opportunities.length > 0 ? opportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />) : <div className="rounded-2xl border border-dashed border-ink/15 bg-white/55 px-5 py-14 text-center text-sm text-slate">No hay oportunidades para revisar hoy.</div>}</section></> : <section className="mt-5 rounded-2xl border border-brass/25 bg-brass/[0.06] p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brass">Pulso de hoy</p><h2 className="mt-1 font-display text-xl text-ink">Contexto para mirar, no para forzar</h2></div><Link href={`/radar${activeClient ? `?client=${encodeURIComponent(activeClient.slug)}` : ""}`} className="text-xs font-bold text-ink underline decoration-ink/25 underline-offset-4">Abrir radar completo</Link></div>{pulse.length > 0 ? <div className="mt-3 grid gap-2 md:grid-cols-2">{pulse.map((signal) => <PulseCard key={signal.id} signal={signal} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-brass/30 bg-white/55 px-4 py-10 text-center text-sm text-slate">Todavía no hay señales editoriales para hoy.</div>}</section>}
  </div>;
}

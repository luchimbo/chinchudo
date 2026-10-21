"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadingMessage } from "@/components/loading-ui";
import { researchCompetitorsForPlanner } from "../configuracion/actions";
import { COMPETITOR_MAX, COMPETITOR_NOTES_MAX, type BlogCatalogProduct } from "@/lib/blog-day-plan";
import { ProductMultiPicker, ProductPicker } from "./product-picker";

export type DayDraft = { productId: string; excludedProductIds: string[]; competitor: string; competitorNotes: string; brief: string };
export const EMPTY_DAY: DayDraft = { productId: "", excludedProductIds: [], competitor: "", competitorNotes: "", brief: "" };

/** Motivos por los que un producto no puede ser protagonista. */
export function blockedProducts(globalExcluded: string[], dayExcluded: string[]) {
  const blocked = new Map<string, string>();
  for (const id of globalExcluded) blocked.set(id, "Excluido siempre");
  for (const id of dayExcluded) blocked.set(id, "Excluido este día");
  return blocked;
}

export const competitorPlaceholder = "Ej.: Akai MPK Mini MK3";

/** Rivales investigados: si no hay ninguno cargado se investigan solos cuando `enabled` (hay una comparativa). */
export function useCompetitorResearch(clientId: string, initial: string[], enabled: boolean) {
  const [competitors, setCompetitors] = useState(initial);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const research = async (force: boolean) => {
    setResearching(true); setError(null);
    try {
      const result = await researchCompetitorsForPlanner(clientId, force);
      if (result.error) setError(result.error); else setCompetitors(result.competitors);
    } catch { setError("No se pudieron investigar los rivales. Reintentá en unos minutos."); }
    finally { setResearching(false); }
  };
  useEffect(() => { if (enabled && !initial.length && !competitors.length && !researching && !error) void research(false); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { competitors, researching, error, research };
}

/** Rival de una comparativa: automático, uno investigado o uno escrito a mano. Solo se muestra en artículos para elegir. */
export function RivalFields({ competitors, draft, onChange, compact = false, name = "" }: { competitors: string[]; draft: DayDraft; onChange: (patch: Partial<DayDraft>) => void; compact?: boolean; name?: string }) {
  const [custom, setCustom] = useState(false);
  const typed = custom || (!!draft.competitor && !competitors.includes(draft.competitor));
  const small = "block w-full rounded-lg border border-ink/20 bg-paper px-2 py-1.5 text-xs";
  const large = "mt-1 block w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 font-normal";
  return <div className="space-y-1.5">
    <label className={compact ? "block" : "block text-sm font-medium text-ink"}>{compact ? <span className="sr-only">Rival</span> : "Comparar con un producto de la competencia"}
      <select value={typed ? "__other" : draft.competitor} onChange={event => {
        if (event.target.value === "__other") { setCustom(true); return; }
        setCustom(false);
        onChange({ competitor: event.target.value, competitorNotes: "" });
      }} className={compact ? small : large}>
        <option value="">Automático (la IA elige)</option>
        {competitors.map(item => <option key={item} value={item}>{item}</option>)}
        <option value="__other">Otro (escribir)…</option>
      </select>
    </label>
    {typed ? <input type="text" maxLength={COMPETITOR_MAX} value={draft.competitor} onChange={event => onChange({ competitor: event.target.value })} placeholder={competitorPlaceholder} className={compact ? small : large} /> : null}
    {name ? <input type="hidden" name={`${name}competitor`} value={draft.competitor} /> : null}
    {draft.competitor.trim() ? <label className={compact ? "block" : "block text-sm font-medium text-ink"}>{compact ? null : <>Qué sabés del rival <span className="font-normal text-slate">(opcional)</span></>}
      <textarea name={name ? `${name}competitorNotes` : undefined} rows={2} maxLength={COMPETITOR_NOTES_MAX} value={draft.competitorNotes} onChange={event => onChange({ competitorNotes: event.target.value })}
        placeholder={compact ? "Qué sabés del rival (opcional)" : "Ej.: no trae pads sensibles, solo USB, sin soporte local."} className={compact ? `${small} resize-y` : `${large} resize-y`} />
      {compact ? null : <span className="mt-1 block text-xs font-normal text-slate">La IA compara con lo que sabe del rival y deja ganando a nuestro producto. Queda pendiente de aprobación para que revises los datos.</span>}
    </label> : null}
  </div>;
}

/** Producto protagonista, rival y exclusiones de un día (formulario de un solo día). */
export function DayPlanFields({ clientId, competitors: knownCompetitors = [], products, globalExcluded, decisionDay, draft, onChange, prefix = "" }: { clientId: string; competitors?: string[]; products: BlogCatalogProduct[]; globalExcluded: string[]; decisionDay: boolean; draft: DayDraft; onChange: (draft: DayDraft) => void; prefix?: string }) {
  const blocked = useMemo(() => blockedProducts(globalExcluded, draft.excludedProductIds), [globalExcluded, draft.excludedProductIds]);
  const globalBlocked = useMemo(() => blockedProducts(globalExcluded, []), [globalExcluded]);
  const set = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch });
  const rivals = useCompetitorResearch(clientId, knownCompetitors, decisionDay);
  if (!products.length) return null;
  return <div className="space-y-3 rounded-lg border border-ink/10 bg-ink/[0.02] p-3">
    <div className="text-sm font-medium text-ink">Producto protagonista <span className="font-normal text-slate">(opcional)</span>
      <div className="mt-1"><ProductPicker products={products} value={draft.productId} onChange={productId => set({ productId })} blocked={blocked} name={`${prefix}productId`} /></div>
    </div>
    {decisionDay ? <div className="space-y-2">
      <RivalFields competitors={rivals.competitors} draft={draft} onChange={set} name={prefix} />
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate" role="status">{rivals.researching ? <LoadingMessage>Investigando rivales…</LoadingMessage> : rivals.error ? <span className="text-signal">{rivals.error}</span> : `${rivals.competitors.length} ${rivals.competitors.length === 1 ? "rival investigado" : "rivales investigados"}.`}<button type="button" disabled={rivals.researching} onClick={() => void rivals.research(true)} className="font-semibold text-moss underline underline-offset-2 disabled:opacity-60">Investigar de nuevo</button></p>
    </div> : null}
    <div className="text-sm font-medium text-ink">No nombrar estos productos <span className="font-normal text-slate">(solo este día)</span>
      <div className="mt-1"><ProductMultiPicker products={products} value={draft.excludedProductIds} onChange={excludedProductIds => set({ excludedProductIds, productId: excludedProductIds.includes(draft.productId) ? "" : draft.productId })} blocked={globalBlocked} name={`${prefix}excludedProductIds`} /></div>
      {globalExcluded.length ? <span className="mt-1 block text-xs font-normal text-slate">{globalExcluded.length} {globalExcluded.length === 1 ? "producto queda" : "productos quedan"} fuera siempre (Configuración).</span> : null}
    </div>
  </div>;
}

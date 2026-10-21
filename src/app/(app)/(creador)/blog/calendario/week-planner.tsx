"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingMessage } from "@/components/loading-ui";
import { BLOG_LANGUAGES, type BlogLanguage } from "@/lib/blog-language";
import { editorialIntentForDate, type EditorialIntent } from "@/lib/blog-quality.mjs";
import { assignIntent, balanceWarnings, type IntentNeighbor } from "@/lib/blog-intent.mjs";
import { shiftDate } from "@/lib/blog-calendar";
import { COMPETITOR_MAX, COMPETITOR_NOTES_MAX, type BlogCatalogProduct } from "@/lib/blog-day-plan";
import { planBlogWeek, type WeekPlanResult } from "./actions";
import { researchCompetitorsForPlanner } from "../configuracion/actions";
import { ProductMultiPicker, ProductPicker } from "./product-picker";
import { blockedProducts, EMPTY_DAY, RivalFields, useCompetitorResearch, type DayDraft } from "./day-plan-fields";
import { BRIEF_MAX_LENGTH } from "./brief-field";

const WEEKDAY = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (day: string) => WEEKDAY.format(new Date(`${day}T00:00:00Z`));

type Props = { clientId: string; products: BlogCatalogProduct[]; globalExcluded: string[]; startDay: string; minDate: string; takenDays: string[]; language: BlogLanguage; comparisons: boolean; balanced?: boolean; neighbors?: IntentNeighbor[]; competitors?: string[] };

/** Arma varios días de una vez: una fila por día con producto, consigna, rival y exclusiones. */
export function WeekPlanner(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-ink/15 px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/5">Planificar semana</button>
    {open ? <WeekPlannerDialog {...props} onClose={() => setOpen(false)} /> : null}
  </>;
}

function WeekPlannerDialog({ clientId, products, globalExcluded, startDay, minDate, takenDays, language: defaultLanguage, comparisons: defaultComparisons, balanced = false, neighbors = [], competitors: knownCompetitors = [], onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const taken = useMemo(() => new Set(takenDays), [takenDays]);
  const [start, setStart] = useState(startDay);
  const [length, setLength] = useState(7);
  const [perDay, setPerDay] = useState(1);
  const [languages, setLanguages] = useState<BlogLanguage[]>([defaultLanguage]);
  const [comparisons, setComparisons] = useState(defaultComparisons);
  const [weekExcluded, setWeekExcluded] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [chosenIntents, setChosenIntents] = useState<Record<string, EditorialIntent>>({});
  const [results, setResults] = useState<Map<string, WeekPlanResult>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= minDate;
  const days = useMemo(() => validStart ? Array.from({ length }, (_, offset) => shiftDate(start, offset)) : [], [start, length, validStart]);
  const draftFor = (day: string) => drafts[day] || EMPTY_DAY;
  const update = (day: string, patch: Partial<DayDraft>) => { setDrafts(current => ({ ...current, [day]: { ...(current[day] || EMPTY_DAY), ...patch } })); setResults(current => { const next = new Map(current); next.delete(day); return next; }); };
  const weekBlocked = useMemo(() => blockedProducts(globalExcluded, []), [globalExcluded]);
  const included = (day: string) => !taken.has(day) && !skipped.has(day) && !results.get(day)?.queued;
  const selectedDays = days.filter(included);
  // Modo balanced: cada día nuevo recibe el tipo sugerido por cuota, de a uno, salvo que se elija a mano.
  const intents = useMemo(() => {
    const placed = [...neighbors];
    const result: Record<string, EditorialIntent> = {};
    for (const day of days) {
      if (taken.has(day) || skipped.has(day)) continue;
      const intent = chosenIntents[day] ?? (balanced ? assignIntent(day, placed) : editorialIntentForDate(day));
      result[day] = intent;
      placed.push({ day, intent });
    }
    return result;
  }, [days, taken, skipped, chosenIntents, neighbors, balanced]);
  const anyDecision = days.some(day => !taken.has(day) && (intents[day] ?? editorialIntentForDate(day)) === "decision");
  const { competitors, researching, error: researchError, research } = useCompetitorResearch(clientId, knownCompetitors, anyDecision);
  const isDecision = (day: string) => (intents[day] ?? (balanced ? neighbors.find(item => item.day === day)?.intent : undefined) ?? editorialIntentForDate(day)) === "decision";
  const balanceNotes = useMemo(() => balanced ? balanceWarnings([...neighbors.filter(item => !(item.day in intents)), ...Object.entries(intents).map(([day, intent]) => ({ day, intent }))]) : [], [balanced, neighbors, intents]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, pending]);

  const copyForward = (from: string) => {
    const source = draftFor(from);
    setDrafts(current => {
      const next = { ...current };
      for (const day of days) if (day > from && included(day)) {
        // El rival solo se copia a días «para elegir».
        next[day] = { ...source, excludedProductIds: [...source.excludedProductIds], competitor: isDecision(day) ? source.competitor : "", competitorNotes: isDecision(day) ? source.competitorNotes : "" };
      }
      return next;
    });
  };

  const submit = async () => {
    if (pending || !selectedDays.length || !languages.length) return;
    setPending(true); setError(null);
    const data = new FormData();
    data.set("clientId", clientId); data.set("rows", String(selectedDays.length));
    selectedDays.forEach((day, index) => {
      const draft = draftFor(day); const key = (name: string) => `day${index}.${name}`;
      data.set(key("include"), "on"); data.set(key("scheduledDate"), day); data.set(key("count"), String(perDay)); data.set(key("language"), languages[0]); if (languages.length > 1) for (const item of languages) data.append(key("dailyLanguages"), item);
      if (intents[day] && (balanced || chosenIntents[day])) data.set(key("editorialIntent"), intents[day]);
      data.set(key("comparisonOffered"), "1"); if (comparisons) data.set(key("comparison"), "on");
      if (draft.brief.trim()) data.set(key("brief"), draft.brief);
      if (draft.productId) data.set(key("productId"), draft.productId);
      for (const id of new Set([...weekExcluded, ...draft.excludedProductIds])) if (id !== draft.productId) data.append(key("excludedProductIds"), id);
      if (isDecision(day) && draft.competitor.trim()) { data.set(key("competitor"), draft.competitor); if (draft.competitorNotes.trim()) data.set(key("competitorNotes"), draft.competitorNotes); }
    });
    try {
      const state = await planBlogWeek({ results: [], error: null }, data);
      setError(state.error);
      setResults(current => { const next = new Map(current); for (const result of state.results) next.set(result.day, result); return next; });
      if (state.results.some(result => result.queued)) router.refresh();
    } catch { setError("No se pudo programar la semana. Verificá tu acceso y reintentá."); }
    finally { setPending(false); }
  };

  const queuedCount = [...results.values()].filter(result => result.queued).length;
  const failedCount = [...results.values()].filter(result => !result.queued).length;

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="week-planner-title" className="flex max-h-[95vh] w-full max-w-7xl flex-col rounded-t-2xl bg-paper shadow-xl sm:rounded-2xl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-6">
        <div>
          <h2 id="week-planner-title" className="font-display text-xl text-ink">Planificar semana</h2>
          <p className="mt-1 text-xs text-slate">Completá solo lo que quieras decidir. Un día sin datos se escribe con tema automático. Los días que ya tienen artículo no se tocan.</p>
        </div>
        <button type="button" onClick={onClose} disabled={pending} aria-label="Cerrar" className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm hover:bg-ink/5">×</button>
      </header>

      <div className="grid gap-3 border-b border-ink/10 bg-ink/[0.02] px-4 py-3 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-[auto_auto_auto_auto_1fr]">
        <label className="font-medium text-ink">Desde
          <input type="date" min={minDate} value={start} onChange={event => { setStart(event.target.value); setResults(new Map()); }} className="mt-1 block w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-normal" />
        </label>
        <label className="font-medium text-ink">Días
          <select value={length} onChange={event => setLength(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-normal"><option value={7}>Una semana (7)</option><option value={14}>Dos semanas (14)</option></select>
        </label>
        <label className="font-medium text-ink">Artículos por día
          <select value={perDay} onChange={event => setPerDay(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-normal">{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select>
        </label>
        <fieldset className="font-medium text-ink">
          <legend>Idiomas</legend>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-ink/15 bg-paper px-3 py-2 font-normal">{BLOG_LANGUAGES.map(item => <label key={item.value} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={languages.includes(item.value)} onChange={event => setLanguages(current => { const next = event.target.checked ? [...current, item.value] : current.filter(value => value !== item.value); return BLOG_LANGUAGES.map(option => option.value).filter(value => next.includes(value)); })} />{item.label}</label>)}</div>
          {languages.length > 1 ? <p className="mt-1 text-[11px] font-normal text-slate">Cada día: el mismo artículo en {languages.length} idiomas.</p> : !languages.length ? <p className="mt-1 text-[11px] font-normal text-signal">Elegí al menos un idioma.</p> : null}
        </fieldset>
        <div className="font-medium text-ink">No nombrar en toda la semana
          <div className="mt-1"><ProductMultiPicker products={products} value={weekExcluded} onChange={setWeekExcluded} blocked={weekBlocked} /></div>
        </div>
        <label className="flex items-start gap-2 text-ink sm:col-span-2 lg:col-span-4"><input type="checkbox" checked={comparisons} onChange={event => setComparisons(event.target.checked)} className="mt-1" /><span>Comparativa automática en días «para elegir» sin rival ni consigna</span></label>
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate sm:col-span-2 lg:col-span-4" role="status">{researching ? <LoadingMessage>Investigando rivales…</LoadingMessage> : researchError ? <span className="text-signal">{researchError}</span> : `${competitors.length} ${competitors.length === 1 ? "rival investigado" : "rivales investigados"} para elegir o rotar en modo automático.`}<button type="button" disabled={researching} onClick={() => void research(true)} className="font-semibold text-moss underline underline-offset-2 disabled:opacity-60">Investigar de nuevo</button></p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        {!validStart ? <p className="py-6 text-sm text-signal">Elegí una fecha de inicio posterior a hoy.</p> : null}
        <div className="hidden gap-3 border-b border-ink/10 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate lg:grid lg:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_6rem]">
          <span>Día</span><span>Producto</span><span>Consigna</span><span>Rival</span><span>No nombrar</span><span />
        </div>
        <ol className="divide-y divide-ink/10">{days.map(day => {
          const draft = draftFor(day);
          const decision = isDecision(day);
          const busy = taken.has(day);
          const result = results.get(day);
          const off = skipped.has(day);
          const locked = busy || !!result?.queued;
          const rowBlocked = blockedProducts([...globalExcluded, ...weekExcluded], draft.excludedProductIds);
          return <li key={day} className={`grid gap-3 py-3 lg:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_6rem] lg:items-start ${locked || off ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-2 lg:block">
              <div>
                <p className="text-sm font-semibold capitalize text-ink">{dayLabel(day)}</p>
                {!busy && !off && !result?.queued ? <select aria-label={`Tipo de artículo del ${dayLabel(day)}`} value={chosenIntents[day] ?? ""} onChange={event => setChosenIntents(current => { const next = { ...current }; if (event.target.value) next[day] = event.target.value as EditorialIntent; else delete next[day]; return next; })} className={`mt-1 block rounded border px-1.5 py-0.5 text-[10px] font-medium ${decision ? "border-brass/30 bg-brass/10 text-brass" : "border-sky-200 bg-sky-50 text-sky-800"}`}><option value="">Auto · {decision ? "Para elegir" : "Educativo"}</option><option value="educational">Educativo</option><option value="decision">Para elegir</option></select>
                  : <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${decision ? "border-brass/30 bg-brass/10 text-brass" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{decision ? "Para elegir" : "Educativo"}</span>}
              </div>
              <div className="text-xs lg:mt-2">
                {busy ? <span className="text-slate">Ya tiene artículo</span>
                  : result?.queued ? <span className="font-semibold text-moss">✓ Programado</span>
                  : <label className="inline-flex items-center gap-1.5 text-slate"><input type="checkbox" checked={!off} onChange={event => setSkipped(current => { const next = new Set(current); if (event.target.checked) next.delete(day); else next.add(day); return next; })} />Incluir</label>}
              </div>
            </div>
            {locked || off ? <p className="text-xs text-slate lg:col-span-5">{busy ? "Este día se gestiona desde el calendario." : result?.queued ? "Se preparará en segundo plano." : "No se programará."}</p> : <>
              <div><span className="mb-1 block text-[11px] font-semibold text-slate lg:hidden">Producto</span><ProductPicker compact products={products} value={draft.productId} onChange={productId => update(day, { productId })} blocked={rowBlocked} /></div>
              <div><span className="mb-1 block text-[11px] font-semibold text-slate lg:hidden">Consigna</span>
                <textarea rows={2} maxLength={BRIEF_MAX_LENGTH} value={draft.brief} onChange={event => update(day, { brief: event.target.value })} placeholder="Tema automático (o escribí uno)" className="block w-full resize-y rounded-lg border border-ink/20 bg-paper px-2 py-1.5 text-xs" />
              </div>
              <div><span className="mb-1 block text-[11px] font-semibold text-slate lg:hidden">Rival</span>
                {decision ? <RivalFields compact competitors={competitors} draft={draft} onChange={patch => update(day, patch)} /> : null}
              </div>
              <div><span className="mb-1 block text-[11px] font-semibold text-slate lg:hidden">No nombrar</span><ProductMultiPicker compact products={products} value={draft.excludedProductIds} onChange={excludedProductIds => update(day, { excludedProductIds, productId: excludedProductIds.includes(draft.productId) ? "" : draft.productId })} blocked={blockedProducts([...globalExcluded, ...weekExcluded], [])} placeholder="Agregar…" /></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs lg:flex-col">
                <button type="button" onClick={() => copyForward(day)} className="text-left font-semibold text-moss underline underline-offset-2">Copiar a los siguientes</button>
                <button type="button" onClick={() => update(day, EMPTY_DAY)} className="text-left text-slate underline underline-offset-2">Limpiar</button>
              </div>
              {result?.error ? <p role="alert" className="text-xs text-signal lg:col-span-5 lg:col-start-2">{result.error}</p> : null}
            </>}
          </li>;
        })}</ol>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-4 py-3 sm:px-6">
        <div className="min-w-0 space-y-1"><p className="text-xs text-slate" role="status">{error ? <span className="text-signal">{error}</span> : results.size ? `${queuedCount} programados${failedCount ? ` · ${failedCount} para revisar` : ""}.` : `${selectedDays.length} ${selectedDays.length === 1 ? "día" : "días"} para programar${perDay > 1 ? `, ${perDay} artículos cada uno` : ""}. Se preparan de a uno, en segundo plano.`}</p>
        {balanceNotes.slice(0, 2).map(note => <p key={note} role="status" className="text-xs text-brass">Aviso: {note}</p>)}</div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-ink hover:bg-ink/5">{queuedCount ? "Listo" : "Cancelar"}</button>
          <button type="button" onClick={submit} disabled={pending || !selectedDays.length || !languages.length} aria-busy={pending} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-60">{pending ? <LoadingMessage>Programando…</LoadingMessage> : `Programar ${selectedDays.length} ${selectedDays.length === 1 ? "día" : "días"}`}</button>
        </div>
      </footer>
    </div>
  </div>;
}

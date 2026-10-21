"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingMessage } from "@/components/loading-ui";
import { generateBlogDate, type GenerateDateState } from "./actions";
import { notifyGenerationStarted, preparationLabel } from "@/lib/blog-tasks";
import { BLOG_LANGUAGES, type BlogLanguage } from "@/lib/blog-language";
import { editorialIntentForDate, type EditorialIntent } from "@/lib/blog-quality.mjs";
import { assignIntent, warningsIntroducedBy, type IntentNeighbor } from "@/lib/blog-intent.mjs";
import { calendarHref } from "@/lib/blog-navigation";
import { BriefField } from "./brief-field";
import { DayPlanFields, EMPTY_DAY, type DayDraft } from "./day-plan-fields";
import type { BlogCatalogProduct } from "@/lib/blog-day-plan";

export function PreparationStatus({ preparation, backgroundTracking = false }: { preparation?: unknown; backgroundTracking?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (backgroundTracking) return;
    const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [router, backgroundTracking]);
  return <div className="space-y-3 text-sm text-slate"><LoadingMessage>{preparationLabel(preparation)}…</LoadingMessage><div role="progressbar" aria-label="Preparación del artículo" aria-valuetext="Preparación en segundo plano" className="loading-progress-track h-1.5 rounded-full"><span /></div><p>Podés seguir trabajando; este día se actualizará cuando esté listo.</p></div>;
}

const intentLabel = (day: string) => editorialIntentForDate(day) === "decision" ? "Artículo para ayudar a elegir" : "Artículo educativo";

/**
 * Pide un artículo para una fecha. En el panel del día la fecha es fija; desde
 * «Nuevo artículo» (`minDate`) se elige y, al terminar, se abre ese día.
 */
export function GenerateDateForm({ clientId, day, language = "es", comparison, minDate, clientSlug, products = [], competitors = [], globalExcluded = [], balanced = false, neighbors = [], initialIntent }: { clientId: string; day: string; language?: BlogLanguage; comparison?: boolean; minDate?: string; clientSlug?: string; products?: BlogCatalogProduct[]; competitors?: string[]; globalExcluded?: string[]; balanced?: boolean; neighbors?: IntentNeighbor[]; initialIntent?: EditorialIntent }) {
  const router = useRouter();
  const [state, setState] = useState<GenerateDateState>({ error: null, queued: false });
  const [pending, setPending] = useState(false);
  const [date, setDate] = useState(day);
  const [draft, setDraft] = useState<DayDraft>(EMPTY_DAY);
  const brief = draft.brief;
  const setBrief = (value: string) => setDraft(current => ({ ...current, brief: value }));
  const editableDate = minDate !== undefined;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  // En modo balanced el tipo se sugiere por cuota y se puede cambiar; si no, lo define la fecha.
  const [chosen, setChosen] = useState<EditorialIntent | null>(initialIntent ?? null);
  const intent: EditorialIntent | null = balanced && validDate ? chosen ?? assignIntent(date, neighbors) : chosen;
  const decisionDay = (intent ?? (validDate ? editorialIntentForDate(date) : null)) === "decision";
  const warnings = intent ? warningsIntroducedBy(neighbors, date, intent) : [];
  if (state.queued && !editableDate) return <PreparationStatus backgroundTracking />;
  return <form onSubmit={async event => {
    event.preventDefault(); if (pending) return;
    const data = new FormData(event.currentTarget); setPending(true);
    try {
      const result = await generateBlogDate({ error: null, queued: false }, data);
      // Revalidation may remove this form before a state effect can run.
      // The accepted request still owns this continuation and must notify both listeners.
      if (result.queued && result.id && result.client) notifyGenerationStarted({ id: result.id, client: result.client, day: date });
      setState(result);
      if (result.queued && editableDate && clientSlug) router.push(calendarHref(clientSlug, date.slice(0, 7), date), { scroll: false });
    } catch { setState({ error: "No se pudo solicitar el artículo. Verificá tu acceso y reintentá.", queued: false }); }
    finally { setPending(false); }
  }} className="space-y-3">
    <input type="hidden" name="clientId" value={clientId} />
    {editableDate ? <label className="block text-sm font-medium text-ink">Fecha de publicación
      <input type="date" name="scheduledDate" required min={minDate} value={date} onChange={event => { setDate(event.target.value); setChosen(null); setState({ error: null, queued: false }); }} className="mt-1 block w-full rounded-lg border border-ink/20 bg-paper px-3 py-2" />
      
    </label> : <input type="hidden" name="scheduledDate" value={day} />}
    {validDate ? <div>
      <label className="block text-sm font-medium text-ink">Tipo de artículo
        <select name={balanced || chosen ? "editorialIntent" : undefined} value={balanced ? intent ?? "" : chosen ?? ""} onChange={event => setChosen((event.target.value || null) as EditorialIntent | null)} className="mt-1 block w-full rounded-lg border border-ink/20 bg-paper px-3 py-2">
          {balanced ? null : <option value="">Automático · {intentLabel(date)}</option>}<option value="educational">Educativo</option><option value="decision">Para ayudar a elegir</option>
        </select>
      </label>
      <p className="mt-1 text-xs text-slate">{chosen ? "Elegido por vos." : balanced ? "Sugerido para mantener la mezcla pareja." : "Según la fecha."}</p>
      {warnings.map(warning => <p key={warning} role="status" className="mt-1 text-xs text-brass">Aviso: {warning}</p>)}
    </div> : null}
    <BriefField value={brief} onChange={setBrief} />
    <DayPlanFields clientId={clientId} competitors={competitors} products={products} globalExcluded={globalExcluded} decisionDay={decisionDay} draft={draft} onChange={next => { setDraft(next); setState({ error: null, queued: false }); }} />
    <label className="block text-sm font-medium text-ink">Idioma del artículo
      <select name="language" defaultValue={language} className="mt-1 block w-full rounded-lg border border-ink/20 bg-paper px-3 py-2">{BLOG_LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </label>
    {comparison !== undefined && decisionDay && !brief.trim() && !draft.competitor.trim() ? <label className="flex items-start gap-2 text-sm text-ink"><input type="hidden" name="comparisonOffered" value="1" /><input type="checkbox" name="comparison" defaultChecked={comparison} className="mt-1" /><span>Comparar con un producto de otra marca<span className="block text-xs text-slate">Se elige automáticamente; las ventajas propias salen de las fichas verificadas.</span></span></label> : null}
    <p className="text-sm text-slate">{draft.competitor.trim() ? `Se preparará una comparativa con ${draft.competitor.trim()}; queda pendiente de tu aprobación.` : brief.trim() ? "Se escribirá sobre tu consigna, con los controles de calidad habituales." : draft.productId ? "Se preparará un artículo centrado en el producto elegido." : "Se preparará un artículo para este día, con los controles de calidad habituales."}</p>
    <button type="submit" disabled={pending} aria-busy={pending} className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-paper disabled:cursor-wait disabled:opacity-60">{pending ? <LoadingMessage>Solicitando…</LoadingMessage> : "Generar artículo"}</button>
    {state.error ? <p role="alert" className="text-sm text-signal">{state.error}</p> : null}
  </form>;
}

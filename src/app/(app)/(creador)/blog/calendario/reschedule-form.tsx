"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { rescheduleBlogArticle, type RescheduleFormState } from "./actions";

export function RescheduleForm({ id, minDate, label }: { id: string; minDate: string; label: string }) {
  const [state, formAction] = useFormState<RescheduleFormState, FormData>(rescheduleBlogArticle, { error: null });
  const [date, setDate] = useState("");
  const errorId = `reschedule-error-${id}`;
  const hintId = `reschedule-hint-${id}`;
  return <form action={formAction} className="space-y-1 text-[11px]">
    <input type="hidden" name="id" value={id} />
    <input type="date" name="scheduledDate" value={date} onChange={event => setDate(event.target.value)} aria-label="Nueva fecha del artículo" aria-describedby={`${hintId}${state.error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(state.error)} min={minDate} required className="w-full rounded border border-ink/15 px-1 py-1" />
    <p id={hintId} className="text-slate">Si el día está ocupado, te avisaremos y podrás elegir la próxima fecha libre compatible.</p>
    <PendingSubmitButton loadingText="Reprogramando…" className="font-semibold text-moss underline">{label}</PendingSubmitButton>
    {state.suggestedDate ? <button type="button" onClick={() => setDate(state.suggestedDate!)} className="block font-semibold text-moss underline">Usar el {state.suggestedDate.split("-").reverse().join("/")}</button> : null}
    {state.error ? <p id={errorId} role="alert" className="text-signal">{state.error}</p> : null}
  </form>;
}

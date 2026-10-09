"use client";

import { useFormState } from "react-dom";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { rescheduleBlogArticle } from "./actions";

export function RescheduleForm({ id, minDate, label }: { id: string; minDate: string; label: string }) {
  const [state, formAction] = useFormState(rescheduleBlogArticle, { error: null });
  const errorId = `reschedule-error-${id}`;
  const hintId = `reschedule-hint-${id}`;
  return <form action={formAction} className="space-y-1 text-[11px]">
    <input type="hidden" name="id" value={id} />
    <input type="date" name="scheduledDate" aria-label="Nueva fecha del artículo" aria-describedby={`${hintId}${state.error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(state.error)} min={minDate} required className="w-full rounded border border-ink/15 px-1 py-1" />
    <p id={hintId} className="text-slate">Si el día está ocupado o es de otro tipo, se usará el primer día libre compatible con el artículo.</p>
    <PendingSubmitButton loadingText="Reprogramando…" className="font-semibold text-moss underline">{label}</PendingSubmitButton>
    {state.error ? <p id={errorId} role="alert" className="text-signal">{state.error}</p> : null}
  </form>;
}

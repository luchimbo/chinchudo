"use client";

import { useFormState } from "react-dom";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { approveAnalysisArticle } from "./actions";

export function ApproveArticleForm({ id }: { id: string }) {
  const [state, action] = useFormState(approveAnalysisArticle, { error: null });
  return <form action={action} className="space-y-2">
    <input type="hidden" name="id" value={id} />
    <PendingSubmitButton loadingText="Aprobando…" className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-paper">Aprobar borrador</PendingSubmitButton>
    {state.error ? <p role="alert" className="text-xs text-signal">{state.error}</p> : null}
  </form>;
}

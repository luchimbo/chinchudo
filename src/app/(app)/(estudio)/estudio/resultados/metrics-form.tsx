"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { smallButton } from "@/components/studio/ui";
import { saveManualMetrics, type ActionState } from "../actions";

const FIELDS: [string, string][] = [["views", "Vistas"], ["saves", "Guardados"], ["shares", "Compartidos"], ["likes", "Me gusta"], ["comments", "Comentarios"]];

/** Carga manual: Fede copia los números de Instagram (Estadísticas del reel). */
export function MetricsForm({ pieceId, initial }: { pieceId: string; initial: Record<string, number | null> | null }) {
  const [open, setOpen] = useState(!initial);
  const [state, action] = useFormState<ActionState, FormData>(saveManualMetrics, { error: null });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={smallButton}>Actualizar números</button>;
  return <form action={action} className="space-y-2">
    <input type="hidden" name="pieceId" value={pieceId} />
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {FIELDS.map(([name, label]) => <label key={name} className="grid gap-1 text-[11px] font-bold text-slate">{label}<input name={name} inputMode="numeric" defaultValue={initial?.[name] ?? ""} className="h-9 w-full rounded-md border border-ink/15 bg-white px-2 text-sm font-normal text-ink" /></label>)}
    </div>
    <div className="flex items-center gap-2">
      <PendingSubmitButton className={smallButton} loadingText="Guardando…">Guardar números</PendingSubmitButton>
      {state.message && <span role="status" className="text-xs font-bold text-moss">✓ {state.message}</span>}
      {state.error && <span role="alert" className="text-xs text-signal">{state.error}</span>}
    </div>
  </form>;
}

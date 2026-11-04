"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import type { CoverageRow } from "@/lib/cm-coverage-view";
type Counts = { total: number; missing: number; stale: number; fresh: number; review: number; error: number };
export function CoveragePanel({ client, initial, pending, optimized, visibleIds = [] }: { client: string; initial: Counts; pending: boolean; optimized: boolean; visibleIds?: string[] }) {
  const [state, setState] = useState({ counts: initial, pending });
  const previous = useRef(pending);
  useEffect(() => {
    const completed = (event: Event) => {
      const { status } = (event as CustomEvent<{ status: string }>).detail;
      setState(current => ({ pending: true, counts: { ...current.counts, total: Math.max(0, current.counts.total - 1),
        ...(["missing", "stale", "fresh", "review", "error"].includes(status) ? { [status]: Math.max(0, current.counts[status as keyof Counts] - 1) } : {}) } }));
    };
    window.addEventListener("cm-opportunity-completed", completed);
    return () => window.removeEventListener("cm-opportunity-completed", completed);
  }, []);
  const router = useRouter(), params = useSearchParams();
  useVisiblePoll<{ counts: Counts; pending: boolean; rows: CoverageRow[] }>(optimized && client ? `/api/cm/coverage?client=${encodeURIComponent(client)}&ids=${encodeURIComponent(visibleIds.join(","))}` : null, value => {
    setState(current => value.pending ? { ...current, pending: true } : value);
    if (previous.current && !value.pending && params.get("response") && params.get("response") !== "generated") router.refresh();
    if (!value.pending) window.dispatchEvent(new CustomEvent("cm-coverage-updated", { detail: { client, rows: value.rows } }));
    previous.current = value.pending;
  }, state.pending);
  const counts = optimized ? state.counts : initial;
  return <section aria-label="Cobertura de propuestas" className="mt-5 rounded-2xl border border-ink/10 bg-white/65 p-4 text-sm">
    <p>{counts.total ? Math.round((counts.fresh + counts.review) * 100 / counts.total) : 0}% con propuesta actualizada · {counts.total} oportunidades activas</p>
    {optimized && state.pending ? <p role="status" className="mt-2 text-xs text-slate">Indicadores pendientes de actualización.</p> : null}
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate"><span>Sin respuesta: {counts.missing}</span><span>Por actualizar: {counts.stale}</span><span>Actualizadas: {counts.fresh}</span><span>Para revisar: {counts.review}</span><span>Con error: {counts.error}</span></div>
  </section>;
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { LoadingSpinner } from "@/components/loading-ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SideSheet } from "@/components/studio/side-sheet";
import { Chip, PIECE_TYPE_LABEL, StatusChip, TrafficLight, primaryButton, secondaryButton, smallButton } from "@/components/studio/ui";
import { getFormula, scoreHook } from "@/lib/reel-craft";
import { addPieceAction, movePiece, proposeWeekAction, setPieceStatus, type ActionState } from "../actions";

export type BoardPiece = { id: string; day: string | null; pieceType: string; status: string; hook: string; format: string; rationale: string; product: string; formulaId: number | null };

export function ProposeWeekForm({ clientId, week }: { clientId: string; week: string }) {
  const [state, action] = useFormState<ActionState, FormData>(proposeWeekAction, { error: null });
  return <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
    <input type="hidden" name="clientId" value={clientId} />
    <input type="hidden" name="week" value={week} />
    <PendingSubmitButton className={primaryButton} loadingText="Armando la semana…">Proponer semana</PendingSubmitButton>
    {state.message && <p role="status" className="text-xs font-bold text-moss">{state.message}</p>}
    {state.error && <p role="alert" className="text-xs text-signal">{state.error}</p>}
  </form>;
}

function PieceCard({ piece, days, dayLabels }: { piece: BoardPiece; days: string[]; dayLabels: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (task: () => Promise<ActionState>) => startTransition(async () => { const result = await task(); setError(result.error ?? ""); });
  const formula = getFormula(piece.formulaId);
  const score = scoreHook(piece.hook).score;
  const discarded = piece.status === "DISCARDED";

  return <article aria-busy={pending} className={`rounded-xl border bg-white p-3 shadow-sm transition ${piece.status === "REVIEW" ? "border-brass/40" : "border-ink/10"} ${pending ? "opacity-60" : ""}`}>
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip tone="bg-ink text-paper">{PIECE_TYPE_LABEL[piece.pieceType] ?? piece.pieceType}</Chip>
      <StatusChip status={piece.status} />
    </div>
    <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-slate">{piece.product}</p>
    <p className="mt-1 text-sm font-bold leading-snug">{piece.hook}</p>
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <TrafficLight score={score} label="Gancho" />
      {formula && <span className="text-[11px] text-slate">{formula.name}</span>}
    </div>
    {piece.rationale && <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate">{piece.rationale}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {piece.status === "REVIEW" && <button type="button" disabled={pending} onClick={() => run(() => setPieceStatus(piece.id, "APPROVED"))} className={`${smallButton} border-ink bg-ink text-paper hover:bg-ink/90`}>Aprobar</button>}
      {!discarded && ["REVIEW", "APPROVED"].includes(piece.status) && <button type="button" disabled={pending} onClick={() => run(() => setPieceStatus(piece.id, "DISCARDED"))} className={smallButton}>Descartar</button>}
      {!discarded && <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate">
        <span className="sr-only">Mover a</span>
        <select value={piece.day ?? ""} disabled={pending} onChange={(event) => run(() => movePiece(piece.id, event.target.value || null))} className="h-8 rounded-md border border-ink/15 bg-paper px-1 text-[11px]">
          <option value="">Sin día</option>
          {days.map((day, index) => <option key={day} value={day}>{dayLabels[index]}</option>)}
        </select>
      </label>}
      {pending && <LoadingSpinner />}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-signal">{error}</p>}
  </article>;
}

export function PlanBoard({ days, dayLabels, dayDates, scheduled, unscheduled, guionesHref }: { days: string[]; dayLabels: string[]; dayDates: string[]; scheduled: BoardPiece[]; unscheduled: BoardPiece[]; guionesHref: string }) {
  const approved = [...scheduled, ...unscheduled].filter((piece) => piece.status === "APPROVED").length;
  return <div className="space-y-6">
    {approved > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-moss/30 bg-moss/10 px-4 py-3">
      <p className="text-sm font-bold text-moss">{approved} pieza{approved === 1 ? "" : "s"} aprobada{approved === 1 ? "" : "s"} esperando guion.</p>
      <Link href={guionesHref} className={secondaryButton}>Escribir guiones →</Link>
    </div>}
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((day, index) => {
        const pieces = scheduled.filter((piece) => piece.day === day);
        return <section key={day} aria-label={`${dayLabels[index]} ${dayDates[index]}`} className="flex min-h-40 flex-col rounded-2xl border border-ink/10 bg-paper/60 p-2">
          <h3 className="px-1 pb-2 text-xs font-black uppercase tracking-wider text-slate">{dayLabels[index]} <span className="font-semibold normal-case tracking-normal text-slate/70">{dayDates[index]}</span></h3>
          <div className="flex flex-1 flex-col gap-2">
            {pieces.map((piece) => <PieceCard key={piece.id} piece={piece} days={days} dayLabels={dayLabels} />)}
            {pieces.length === 0 && <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-ink/10 px-2 py-6 text-center text-xs text-slate/60">Libre</p>}
          </div>
        </section>;
      })}
    </div>
    {unscheduled.length > 0 && <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-brass">Sin día asignado</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{unscheduled.map((piece) => <PieceCard key={piece.id} piece={piece} days={days} dayLabels={dayLabels} />)}</div>
    </section>}
  </div>;
}

export function AddPieceButton({ clientId, products, days }: { clientId: string; products: { id: string; name: string }[]; days: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<ActionState, FormData>(addPieceAction, { error: null });
  const field = "grid gap-1.5 text-sm font-bold";
  const input = "h-11 rounded-md border border-ink/15 bg-white px-3 text-sm font-normal";
  return <>
    <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>+ Agregar idea</button>
    {open && <SideSheet title="Agregar una idea" onClose={() => setOpen(false)}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />
        <label className={field}>¿De qué trata?<textarea name="hook" required rows={3} placeholder="Ej.: Mostrar cómo practicar batería de noche sin molestar" className="rounded-md border border-ink/15 bg-white p-3 text-sm font-normal" /></label>
        <label className={field}>Producto<select name="productId" required className={input}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>Formato<select name="pieceType" className={input}><option value="REEL">Reel</option><option value="CAROUSEL">Carrusel</option><option value="STORY">Historia</option></select></label>
          <label className={field}>Día<select name="day" className={input}><option value="">Sin día</option>{days.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
        </div>
        <label className={field}>Objetivo<select name="intent" className={input}><option value="USE_CASE">Mostrar uso</option><option value="EDUCATION">Resolver una duda</option><option value="SALE">Vender</option><option value="ENTERTAINMENT">Entretener</option></select></label>
        <PendingSubmitButton className={`${primaryButton} w-full`} loadingText="Guardando…">Agregar al plan</PendingSubmitButton>
        {state.message && <p role="status" className="text-sm font-bold text-moss">✓ {state.message}</p>}
        {state.error && <p role="alert" className="text-sm text-signal">{state.error}</p>}
      </form>
    </SideSheet>}
  </>;
}

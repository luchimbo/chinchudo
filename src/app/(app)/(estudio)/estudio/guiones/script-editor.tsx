"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/loading-ui";
import { SideSheet } from "@/components/studio/side-sheet";
import { ScriptQuality } from "@/components/studio/script-quality";
import { TrafficLight, primaryButton, secondaryButton, smallButton } from "@/components/studio/ui";
import { CARDS_HEADER, buildScriptQualityReport, lintCaption, type DraftBeat, type ScriptQualityReport } from "@/lib/reel-craft";
import { discardScript, markScriptReady, saveScriptEdit } from "../actions";

export type EditorScript = { id: string; product: string; persona: string; status: string; hook: string; bodyText: string; cta: string; caption: string; visualCues: string; qualityReport: unknown };

function initialBeats(script: EditorScript, report: ScriptQualityReport | null): DraftBeat[] {
  const sheetBeats = report?.beatSheet?.beats ?? [];
  // El reporte guarda [gancho, …cuerpo, cierre]: el cuerpo es lo del medio.
  if (sheetBeats.length >= 3 && sheetBeats[0].text === script.hook) return sheetBeats.slice(1, -1).map((beat) => ({ spoken: beat.text, onScreen: beat.onScreen ?? "" }));
  return script.bodyText.split(/\r?\n/).filter((line) => line.trim()).map((spoken) => ({ spoken, onScreen: "" }));
}

function visualNotesOf(visualCues: string) {
  return visualCues.startsWith(CARDS_HEADER) ? visualCues.split(/\r?\n\r?\n/).slice(1).join("\n\n") : visualCues;
}

export function ScriptEditor({ script, closeHref }: { script: EditorScript; closeHref: string }) {
  const router = useRouter();
  const saved = script.qualityReport && typeof script.qualityReport === "object" && (script.qualityReport as ScriptQualityReport).version === 1 ? script.qualityReport as ScriptQualityReport : null;
  const [hook, setHook] = useState(script.hook);
  const [hookOnScreen, setHookOnScreen] = useState(saved?.hook.onScreen ?? "");
  const [beats, setBeats] = useState<DraftBeat[]>(() => initialBeats(script, saved));
  const [cta, setCta] = useState(script.cta);
  const [caption, setCaption] = useState(script.caption);
  const [visualNotes, setVisualNotes] = useState(visualNotesOf(script.visualCues));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const report = useMemo(() => buildScriptQualityReport({ hookOptions: [{ spoken: hook, onScreen: hookOnScreen }], beats: [...beats, { spoken: cta }], caption }), [hook, hookOnScreen, beats, cta, caption]);
  const alternatives = (saved?.hookOptions ?? []).filter((option) => option.spoken !== hook);
  const captionReport = lintCaption(caption);
  const close = () => router.push(closeHref, { scroll: false });

  const save = (then?: () => Promise<{ error: string | null; message?: string }>) => startTransition(async () => {
    setError(""); setMessage("");
    const result = await saveScriptEdit({ scriptId: script.id, hook, hookOnScreen, beats, cta, caption, visualNotes });
    if (result.error) { setError(result.error); return; }
    if (then) {
      const next = await then();
      if (next.error) { setError(next.error); return; }
      close();
      return;
    }
    setMessage(result.message ?? "Guardado.");
  });

  const updateBeat = (index: number, patch: Partial<DraftBeat>) => setBeats((current) => current.map((beat, i) => (i === index ? { ...beat, ...patch } : beat)));
  const field = "w-full rounded-md border border-ink/15 bg-white p-2.5 text-sm";

  return <SideSheet title={`Guion · ${script.product}`} onClose={close} wide>
    <p className="text-xs text-slate">Voz: <span className="font-bold text-ink">{script.persona}</span>. Editá lo que quieras: los semáforos se actualizan mientras escribís.</p>
    <ScriptQuality report={report} />

    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-wider text-brass">Gancho (primeros 3 segundos)</h3><TrafficLight score={report.hook.score} /></div>
      <textarea value={hook} onChange={(event) => setHook(event.target.value)} rows={2} className={field} aria-label="Gancho hablado" />
      <input value={hookOnScreen} onChange={(event) => setHookOnScreen(event.target.value)} placeholder="Texto en pantalla (6 palabras o menos)" className={field} aria-label="Texto en pantalla del gancho" />
      {alternatives.length > 0 && <details>
        <summary className="cursor-pointer text-xs font-bold text-slate">Otras opciones de gancho ({alternatives.length})</summary>
        <ul className="mt-2 space-y-2">{alternatives.map((option) => <li key={option.spoken} className="flex items-start justify-between gap-2 rounded-lg border border-ink/10 bg-white p-2">
          <span className="text-sm">{option.spoken}</span>
          <button type="button" onClick={() => { setHook(option.spoken); setHookOnScreen(option.onScreen); }} className={smallButton}>Usar</button>
        </li>)}</ul>
      </details>}
    </section>

    <section className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-brass">Cuerpo, una idea por línea</h3>
      {beats.map((beat, index) => <div key={index} className="rounded-xl border border-ink/10 bg-white p-2">
        <div className="flex gap-2">
          <textarea value={beat.spoken} onChange={(event) => updateBeat(index, { spoken: event.target.value })} rows={2} className={`${field} border-0 p-1.5`} aria-label={`Tramo ${index + 2}`} />
          <button type="button" onClick={() => setBeats((current) => current.filter((_, i) => i !== index))} aria-label={`Borrar tramo ${index + 2}`} className="self-start rounded px-2 py-1 text-slate hover:bg-ink/5">×</button>
        </div>
        <input value={beat.onScreen ?? ""} onChange={(event) => updateBeat(index, { onScreen: event.target.value })} placeholder="Texto en pantalla (opcional)" className="mt-1 w-full rounded-md bg-paper/70 px-2 py-1.5 text-xs" aria-label={`Texto en pantalla del tramo ${index + 2}`} />
      </div>)}
      <button type="button" onClick={() => setBeats((current) => [...current, { spoken: "", onScreen: "" }])} className={smallButton}>+ Agregar línea</button>
    </section>

    <section className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-brass">Cierre (un solo pedido)</h3>
      <textarea value={cta} onChange={(event) => setCta(event.target.value)} rows={2} className={field} aria-label="Cierre" />
    </section>

    <section className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-brass">Descripción de la publicación</h3>
      <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={4} className={field} aria-label="Descripción" />
      <p className="rounded-lg bg-white p-2 text-xs"><span className="font-bold">Se ve en el feed: </span>{captionReport.visible}{captionReport.truncated && <span className="text-slate"> más</span>}</p>
    </section>

    <section className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-brass">Indicaciones para grabar</h3>
      <textarea value={visualNotes} onChange={(event) => setVisualNotes(event.target.value)} rows={4} className={field} aria-label="Indicaciones para grabar" />
    </section>

    <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-ink/10 bg-paper px-5 py-3 sm:-mx-6 sm:px-6">
      <button type="button" disabled={pending} onClick={() => save(() => markScriptReady(script.id))} className={primaryButton}>Listo para grabar</button>
      <button type="button" disabled={pending} onClick={() => save()} className={secondaryButton}>Guardar</button>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await discardScript(script.id); if (result.error) setError(result.error); else close(); })} className="ml-auto text-xs font-bold text-signal hover:underline">Descartar guion</button>
      {pending && <LoadingSpinner />}
      {message && <p role="status" className="w-full text-xs font-bold text-moss">✓ {message}</p>}
      {error && <p role="alert" className="w-full text-xs text-signal">{error}</p>}
    </div>
  </SideSheet>;
}

"use client";

import { useState } from "react";
import type { Trend } from "@prisma/client";
import { LoadingSpinner } from "@/components/loading-ui";
import { classifyHook, readReelCraftMeta, referenceHook, timecode, type ScriptQualityReport } from "@/lib/reel-craft";

const VERDICT_STYLE: Record<string, string> = {
  STRONG: "bg-moss/15 text-moss",
  PASS: "bg-moss/15 text-moss",
  OK: "bg-brass/15 text-brass",
  REVIEW: "bg-brass/15 text-brass",
  WEAK: "bg-red-100 text-red-700",
  FLAGGED: "bg-red-100 text-red-700",
};

export function readQualityReport(value: unknown): ScriptQualityReport | null {
  return value && typeof value === "object" && (value as ScriptQualityReport).version === 1 ? (value as ScriptQualityReport) : null;
}

export function VerdictBadge({ verdict, score, label }: { verdict: string; score: number; label?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider ${VERDICT_STYLE[verdict] || "bg-ink/10 text-ink"}`}>{label ? `${label} ` : ""}{Math.round(score)} · {verdict}</span>;
}

/** Métricas de ig-viral sobre una referencia: vistas, múltiplo y fórmula del hook. */
export function ReferenceSignals({ trend }: { trend: Trend }) {
  const stored = readReelCraftMeta(trend.metadata);
  // Referencias importadas antes de reel-craft: se clasifica el título al vuelo.
  const fallback = stored.formulaId === undefined ? classifyHook(referenceHook(trend.title)) : null;
  const meta = fallback ? { ...stored, formulaId: fallback.id, formulaName: fallback.name } : stored;
  const chips: { text: string; tone: string; title?: string }[] = [];
  if (meta.outlierMultiple) chips.push({ text: `×${meta.outlierMultiple} su canal`, tone: meta.band === "signal" ? "bg-moss/15 text-moss" : "bg-ink/5 text-slate", title: `Vistas sobre la mediana de ${meta.medianSamples} videos del canal` });
  if (meta.views) chips.push({ text: `${new Intl.NumberFormat("es-AR", { notation: "compact" }).format(meta.views)} vistas`, tone: "bg-ink/5 text-slate" });
  if (meta.formulaName) chips.push({ text: `#${meta.formulaId} ${meta.formulaName}`, tone: "bg-brass/10 text-brass" });
  if (!chips.length) return null;
  return <div className="mt-3 flex flex-wrap gap-2">{chips.map((chip) => <span key={chip.text} title={chip.title} className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider ${chip.tone}`}>{chip.text}</span>)}</div>;
}

type Props = { report: ScriptQualityReport; caption: string; hook: string; onChooseHook: (hook: string) => Promise<void> };

export function ScriptCraftPanel({ report, caption, hook, onChooseHook }: Props) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const sheet = report.beatSheet;

  async function choose(spoken: string) {
    setChoosing(spoken);
    setError("");
    try {
      await onChooseHook(spoken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el hook.");
    } finally {
      setChoosing(null);
    }
  }

  const { visible, truncated } = report.caption;

  return <div className="mt-6 grid gap-6">
    <section className="rounded-xl border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-black uppercase tracking-wider text-brass">Calidad del Reel</p>
        <VerdictBadge label="Hook" verdict={report.hook.verdict} score={report.hook.score} />
        <VerdictBadge label="Humano" verdict={report.human.verdict} score={report.human.score} />
        {sheet && <span className="rounded bg-ink/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate">{sheet.totalSeconds.toFixed(1)}s · {sheet.beats.length} beats</span>}
      </div>
      {report.problems.length > 0 ? <ul className="mt-3 grid gap-1 text-sm text-red-700">{report.problems.map((problem) => <li key={problem}>· {problem}</li>)}</ul> : <p className="mt-3 text-sm text-moss">Listo para grabar: sin flags de hook, beats ni caption.</p>}
    </section>

    {report.hookOptions.length > 1 && <section>
      <p className="text-xs font-black uppercase tracking-wider text-brass">Opciones de hook</p>
      <div className="mt-2 grid gap-2">{report.hookOptions.map((option) => {
        const active = option.spoken === hook;
        return <div key={option.spoken} className={`rounded-lg border p-3 ${active ? "border-brass bg-brass/10" : "border-ink/10 bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2"><VerdictBadge verdict={option.verdict} score={option.score} />{option.formulaName && <span className="text-[10px] font-black uppercase tracking-wider text-slate">#{option.formulaId} {option.formulaName}</span>}</div>
          <p className="mt-2 text-sm font-bold">{option.spoken}</p>
          {option.onScreen && <p className="mt-1 text-xs text-slate">En pantalla: {option.onScreen}</p>}
          {!active && <button type="button" disabled={choosing !== null} onClick={() => choose(option.spoken)} className="mt-2 rounded-md border border-ink/15 px-3 py-1 text-xs font-black disabled:opacity-50">{choosing === option.spoken ? <span className="inline-flex items-center gap-2"><LoadingSpinner />Cambiando…</span> : "Usar este hook"}</button>}
        </div>;
      })}</div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>}

    {sheet && <section>
      <p className="text-xs font-black uppercase tracking-wider text-brass">Beat sheet · {sheet.wpm} palabras por minuto</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-ink/10 bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-[10px] font-black uppercase tracking-wider text-slate"><tr><th className="px-3 py-2">Tiempo</th><th className="px-3 py-2">Beat</th><th className="px-3 py-2">Dice</th><th className="px-3 py-2">En pantalla</th></tr></thead>
          <tbody>{sheet.beats.map((beat) => <tr key={beat.n} className="border-t border-ink/5 align-top">
            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{timecode(beat.start)}<span className="block text-slate">{beat.dur.toFixed(1)}s</span></td>
            <td className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-brass">{beat.label || beat.n}</td>
            <td className="px-3 py-2">{beat.text}{beat.flags.map((flag) => <span key={flag} className="mt-1 block text-xs font-bold text-red-700">↑ {flag}</span>)}</td>
            <td className="px-3 py-2 text-xs font-bold uppercase">{beat.onScreen || ""}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <ul className="mt-2 grid gap-1 text-xs text-slate">{sheet.notes.map((note) => <li key={note}>· {note}</li>)}</ul>
    </section>}

    {caption && <section>
      <p className="text-xs font-black uppercase tracking-wider text-brass">Caption</p>
      <div className="mt-2 rounded-lg border border-ink/10 bg-white p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate">Lo que se ve en el feed</p>
        <p className="mt-1 text-sm font-bold">{visible}{truncated && <span className="font-normal text-slate"> más</span>}</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{caption}</p>
      <ul className="mt-2 grid gap-1 text-xs">{report.caption.checks.map((check) => <li key={check.name} className={check.status === "FAIL" ? "text-red-700" : check.status === "WARN" ? "text-brass" : "text-moss"}>{check.status} · {check.name}: {check.detail}</li>)}</ul>
    </section>}
  </div>;
}

"use client";

import { HOOK_CHECK_LABEL, beatLabel, timecode, type ScriptQualityReport } from "@/lib/reel-craft";
import { TrafficLight } from "./ui";

/** Resumen de calidad del guion en lenguaje simple: semáforos, avisos y tiempos. */
export function ScriptQuality({ report }: { report: ScriptQualityReport }) {
  const sheet = report.beatSheet;
  const voiceIssues = report.voice?.warnings.length ?? 0;
  return <section aria-label="Calidad del guion" className="space-y-4 rounded-2xl border border-ink/10 bg-white p-4">
    <div className="flex flex-wrap gap-2">
      <TrafficLight score={report.hook.score} label="Gancho" />
      <TrafficLight score={report.human.score} label="Suena natural" />
      <TrafficLight score={voiceIssues ? 40 : 100} label="Español argentino" />
      {sheet && <span className="inline-flex items-center rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-slate">≈ {Math.round(sheet.totalSeconds)} segundos</span>}
    </div>
    {report.hook.score < 70 && <p className="text-xs text-slate">Para mejorar el gancho, trabajá: <span className="font-bold text-ink">{HOOK_CHECK_LABEL[report.hook.weakest]}</span>.</p>}
    {report.problems.length > 0 ? <ul className="space-y-1 text-sm text-signal">{report.problems.slice(0, 6).map((problem) => <li key={problem}>· {problem}</li>)}</ul> : <p className="text-sm font-bold text-moss">Sin avisos: listo para grabar.</p>}
    {sheet && <details className="text-sm">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-brass">Ver tiempos</summary>
      <ol className="mt-2 space-y-1">{sheet.beats.map((beat) => <li key={beat.n} className="grid grid-cols-[3.5rem_5rem_1fr] gap-2 text-xs">
        <span className="font-mono text-slate">{timecode(beat.start)}</span>
        <span className="font-black uppercase text-brass">{beatLabel(beat.label, beat.n)}</span>
        <span>{beat.text}{beat.flags.map((flag) => <span key={flag} className="block font-bold text-signal">↑ {flag}</span>)}</span>
      </li>)}</ol>
    </details>}
  </section>;
}

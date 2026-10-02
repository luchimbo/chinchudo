"use client";

import Link from "next/link";
import type { ArticleDraft } from "@/lib/article-edit";
import type { ArticleCatalog } from "@/lib/article-markers";
import type { DecisionOption, DecisionSupport, EditorialSource } from "@/lib/blog-quality.mjs";

const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink";
const lines = (s: string) => s.split(/\r?\n/);
const emptyOption = (): DecisionOption => ({ product_id: "", suitable_for: "", advantages: "", limitations: "", evidence_ids: [] });

export function EvidenceEditor({ draft, onChange, sources, catalog }: { draft: ArticleDraft; onChange: (next: ArticleDraft) => void; sources: EditorialSource[]; catalog: ArticleCatalog }) {
  const decision = draft.decision;
  const updateDecision = (next: DecisionSupport | null) => onChange({ ...draft, decision: next });
  const updateOption = (index: number, next: Partial<DecisionOption>) => {
    if (decision) updateDecision({ ...decision, options: decision.options.map((option, i) => i === index ? { ...option, ...next } : option) });
  };
  return <section className="mt-10 space-y-5 border-t border-ink/10 pt-6">
    <div><h2 className="font-display text-2xl text-ink">Fuentes y decisiones</h2><p className="mt-1 text-sm text-slate">Citá las fuentes desde el botón de enlaces del cuerpo. Las afirmaciones técnicas y comerciales deben coincidir con la evidencia revisada.</p><Link href="/blog/fuentes?client=pcmidi" className="text-sm font-semibold text-moss underline">Administrar fuentes</Link></div>
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Fuentes disponibles</legend>
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-ink/10 p-3">
        {sources.map((s) => <details key={s.id} className="rounded-lg bg-ink/[0.025] p-2">
          <summary className="cursor-pointer text-sm"><label onClick={(e) => e.stopPropagation()} className="mr-2"><input type="checkbox" checked={(draft.sourceIds || []).includes(s.id)} onChange={(e) => onChange({ ...draft, sourceIds: e.target.checked ? [...new Set([...(draft.sourceIds || []), s.id])] : (draft.sourceIds || []).filter((id) => id !== s.id) })} aria-label={`Incluir ${s.title}`} /></label>{s.title}</summary>
          <p className="mt-2 text-xs text-slate">Verificada: {s.verifiedAt.slice(0, 10)} · {s.reviewedBy}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate">{s.claims.map((claim, i) => <li key={i}>{claim}</li>)}</ul>
        </details>)}
        {!sources.length ? <p className="text-sm text-slate">Agregá evidencia revisada para respaldar datos concretos.</p> : null}
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Comparativa de productos</h3><button type="button" className="text-sm font-semibold text-moss underline" onClick={() => updateDecision(decision ? null : { criteria: [], options: [emptyOption(), emptyOption()], recommendation: "" })}>{decision ? "Quitar comparativa" : "Agregar comparativa"}</button></div>
    {decision ? <div className="space-y-4">
      <label className="grid gap-1 text-sm font-semibold">Criterios de decisión, uno por línea<textarea rows={3} value={decision.criteria.join("\n")} onChange={(e) => updateDecision({ ...decision, criteria: lines(e.target.value) })} className={field} /></label>
      {decision.options.map((option, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-ink/10 p-4"><legend className="px-2 text-sm font-semibold">Alternativa {index + 1}</legend>
        <label className="grid gap-1 text-xs font-semibold">Producto<select value={option.product_id} onChange={(e) => updateOption(index, { product_id: e.target.value, evidence_ids: [] })} className={field}><option value="">Elegí un producto</option>{catalog.products.map((p) => <option key={p.ref} value={p.ref}>{p.name}</option>)}</select></label>
        {([['suitable_for', 'Para quién conviene'], ['advantages', 'Ventajas respaldadas'], ['limitations', 'Limitaciones y aspectos por verificar']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs font-semibold">{label}<textarea rows={2} value={option[key]} onChange={(e) => updateOption(index, { [key]: e.target.value })} className={field} /></label>)}
        <fieldset className="space-y-1"><legend className="mb-1 text-xs font-semibold">Evidencia de esta alternativa</legend>{sources.filter((s) => s.productIds.includes(option.product_id)).map((s) => <label key={s.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={option.evidence_ids.includes(s.id)} onChange={(e) => {
          const ids = e.target.checked ? [...new Set([...option.evidence_ids, s.id])] : option.evidence_ids.filter((id) => id !== s.id);
          onChange({ ...draft, sourceIds: [...new Set([...(draft.sourceIds || []), ...ids])], decision: { ...decision, options: decision.options.map((o, i) => i === index ? { ...o, evidence_ids: ids } : o) } });
        }} />{s.title}</label>)}</fieldset>
        <button type="button" className="text-xs text-rose-700 underline" onClick={() => updateDecision({ ...decision, options: decision.options.filter((_, i) => i !== index) })}>Quitar alternativa</button>
      </fieldset>)}
      <button type="button" className="text-sm font-semibold text-moss underline" onClick={() => updateDecision({ ...decision, options: [...decision.options, emptyOption()] })}>Agregar alternativa</button>
      <label className="grid gap-1 text-sm font-semibold">Recomendación según la necesidad<textarea rows={3} value={decision.recommendation} onChange={(e) => updateDecision({ ...decision, recommendation: e.target.value })} className={field} /></label>
    </div> : <p className="text-xs text-slate">Obligatoria en artículos de elección. En guías educativas, sumala cuando ayude a decidir.</p>}
  </section>;
}

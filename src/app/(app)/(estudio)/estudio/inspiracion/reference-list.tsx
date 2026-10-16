"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { Trend } from "@prisma/client";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Chip, smallButton } from "@/components/studio/ui";
import { classifyHook, getFormula, multiplePhrase, readReelCraftMeta, referenceHook } from "@/lib/reel-craft";
import { referenceToIdea, type ActionState } from "../actions";

const NETWORK: Record<string, string> = { TIKTOK: "TikTok", TIKTOK_HASHTAG: "TikTok", TIKTOK_CREATIVE_CENTER: "TikTok", INSTAGRAM: "Instagram", YOUTUBE: "YouTube", VIRAL_MARKETING: "Formato" };
const NETWORK_FILTERS = ["Todas", "Instagram", "TikTok", "YouTube", "Formato"];

function referenceView(trend: Trend) {
  const meta = readReelCraftMeta(trend.metadata);
  const hook = referenceHook(trend.title);
  const formula = getFormula(meta.formulaId ?? null) ?? classifyHook(hook);
  return { meta, hook, formula, network: NETWORK[trend.platform] ?? "Otra", standsOut: meta.band === "signal" || (meta.band == null && trend.viabilityScore >= 4) };
}

function UseAsIdea({ trendId }: { trendId: string }) {
  const [state, action] = useFormState<ActionState, FormData>(referenceToIdea, { error: null });
  return <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
    <input type="hidden" name="trendId" value={trendId} />
    {state.message ? <span role="status" className="text-xs font-bold text-moss">✓ {state.message}</span> : <PendingSubmitButton className={smallButton} loadingText="Agregando…">Usar como idea</PendingSubmitButton>}
    {state.error ? <span role="alert" className="text-xs text-signal">{state.error}</span> : null}
  </form>;
}

export function ReferenceList({ references }: { references: Trend[] }) {
  const [network, setNetwork] = useState("Todas");
  const [onlyStandouts, setOnlyStandouts] = useState(false);
  const rows = useMemo(() => references.map((trend) => ({ trend, ...referenceView(trend) })), [references]);
  const visible = rows.filter((row) => (network === "Todas" || row.network === network) && (!onlyStandouts || row.standsOut));

  return <div>
    <div className="flex flex-wrap items-center gap-2">
      {NETWORK_FILTERS.map((option) => <button key={option} type="button" onClick={() => setNetwork(option)} aria-pressed={network === option} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${network === option ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white text-slate hover:border-ink/40"}`}>{option}</button>)}
      <label className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-slate"><input type="checkbox" checked={onlyStandouts} onChange={(event) => setOnlyStandouts(event.target.checked)} className="h-4 w-4 accent-ink" />Solo las que destacan</label>
    </div>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visible.map(({ trend, meta, hook, formula, network: label, standsOut }) => <article key={trend.id} className="flex flex-col rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{label}</Chip>
          {standsOut && <Chip tone="bg-moss/15 text-moss">Destacada</Chip>}
          {formula && <Chip tone="bg-brass/10 text-brass">Gancho: {formula.name}</Chip>}
        </div>
        <h3 className="mt-3 text-base font-black leading-snug">{hook}</h3>
        {multiplePhrase(meta.outlierMultiple) && <p className="mt-2 text-sm font-bold text-moss">A esta cuenta {multiplePhrase(meta.outlierMultiple)}.</p>}
        {meta.views ? <p className="mt-1 text-xs text-slate">{new Intl.NumberFormat("es-AR", { notation: "compact" }).format(meta.views)} vistas{meta.channel ? ` · ${meta.channel}` : ""}</p> : null}
        {trend.suggestedAngle && <p className="mt-3 text-sm leading-6 text-slate"><span className="font-bold text-ink">Cómo usarla: </span>{trend.suggestedAngle}</p>}
        <div className="mt-auto">
          {trend.sourceUrl && <a href={trend.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs font-bold underline decoration-ink/30 underline-offset-4">Ver original ↗</a>}
          <UseAsIdea trendId={trend.id} />
        </div>
      </article>)}
    </div>
    {visible.length === 0 && <p className="mt-6 text-sm text-slate">No hay referencias con estos filtros.</p>}
  </div>;
}

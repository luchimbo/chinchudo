"use client";

import { useMemo } from "react";
import { COMPETITOR_MAX, COMPETITOR_NOTES_MAX, type BlogCatalogProduct } from "@/lib/blog-day-plan";
import { ProductMultiPicker, ProductPicker } from "./product-picker";

export type DayDraft = { productId: string; excludedProductIds: string[]; competitor: string; competitorNotes: string; brief: string };
export const EMPTY_DAY: DayDraft = { productId: "", excludedProductIds: [], competitor: "", competitorNotes: "", brief: "" };

/** Motivos por los que un producto no puede ser protagonista. */
export function blockedProducts(globalExcluded: string[], dayExcluded: string[]) {
  const blocked = new Map<string, string>();
  for (const id of globalExcluded) blocked.set(id, "Excluido siempre");
  for (const id of dayExcluded) blocked.set(id, "Excluido este día");
  return blocked;
}

export const competitorPlaceholder = "Ej.: Akai MPK Mini MK3";

/** Producto protagonista, rival y exclusiones de un día (formulario de un solo día). */
export function DayPlanFields({ products, globalExcluded, decisionDay, draft, onChange, prefix = "" }: { products: BlogCatalogProduct[]; globalExcluded: string[]; decisionDay: boolean; draft: DayDraft; onChange: (draft: DayDraft) => void; prefix?: string }) {
  const blocked = useMemo(() => blockedProducts(globalExcluded, draft.excludedProductIds), [globalExcluded, draft.excludedProductIds]);
  const globalBlocked = useMemo(() => blockedProducts(globalExcluded, []), [globalExcluded]);
  const set = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch });
  if (!products.length) return null;
  return <div className="space-y-3 rounded-lg border border-ink/10 bg-ink/[0.02] p-3">
    <div className="text-sm font-medium text-ink">Producto protagonista <span className="font-normal text-slate">(opcional)</span>
      <div className="mt-1"><ProductPicker products={products} value={draft.productId} onChange={productId => set({ productId })} blocked={blocked} name={`${prefix}productId`} /></div>
    </div>
    {decisionDay ? <div className="space-y-2">
      <label className="block text-sm font-medium text-ink">Comparar con un producto de la competencia <span className="font-normal text-slate">(opcional)</span>
        <input type="text" name={`${prefix}competitor`} maxLength={COMPETITOR_MAX} value={draft.competitor} onChange={event => set({ competitor: event.target.value })} placeholder={competitorPlaceholder}
          className="mt-1 block w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 font-normal" />
      </label>
      {draft.competitor.trim() ? <label className="block text-sm font-medium text-ink">Qué sabés del rival <span className="font-normal text-slate">(opcional)</span>
        <textarea name={`${prefix}competitorNotes`} rows={2} maxLength={COMPETITOR_NOTES_MAX} value={draft.competitorNotes} onChange={event => set({ competitorNotes: event.target.value })}
          placeholder="Ej.: no trae pads sensibles, solo USB, sin soporte local."
          className="mt-1 block w-full resize-y rounded-lg border border-ink/20 bg-paper px-3 py-2 font-normal" />
        <span className="mt-1 block text-xs font-normal text-slate">La IA compara con lo que sabe del rival y deja ganando a nuestro producto. Queda pendiente de aprobación para que revises los datos.</span>
      </label> : null}
    </div> : <p className="text-xs text-slate">Las comparativas con la competencia se programan en días «para elegir».</p>}
    <div className="text-sm font-medium text-ink">No nombrar estos productos <span className="font-normal text-slate">(solo este día)</span>
      <div className="mt-1"><ProductMultiPicker products={products} value={draft.excludedProductIds} onChange={excludedProductIds => set({ excludedProductIds, productId: excludedProductIds.includes(draft.productId) ? "" : draft.productId })} blocked={globalBlocked} name={`${prefix}excludedProductIds`} /></div>
      {globalExcluded.length ? <span className="mt-1 block text-xs font-normal text-slate">{globalExcluded.length} {globalExcluded.length === 1 ? "producto queda" : "productos quedan"} fuera siempre (Configuración).</span> : null}
    </div>
  </div>;
}

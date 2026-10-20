"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { BlogCatalogProduct } from "@/lib/blog-day-plan";
import { ProductMultiPicker } from "../calendario/product-picker";

/** Productos propios que ningún artículo del blog puede nombrar (sin stock, discontinuados…). */
export function ExcludedProductsForm({ clientId, products, excluded, action }: { clientId: string; products: BlogCatalogProduct[]; excluded: string[]; action: (formData: FormData) => Promise<void> }) {
  const [value, setValue] = useState(excluded);
  const changed = value.length !== excluded.length || value.some(id => !excluded.includes(id));
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={clientId} />
    <ProductMultiPicker products={products} value={value} onChange={setValue} name="excludedProductIds" placeholder="Buscar producto para excluir…" />
    <p className="text-xs text-slate">{value.length ? `${value.length} ${value.length === 1 ? "producto excluido" : "productos excluidos"}.` : "Ningún producto excluido."} El generador no los nombra ni los enlaza, y no se pueden elegir como protagonistas.</p>
    <PendingSubmitButton loadingText="Guardando…" disabled={!changed} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper disabled:opacity-50">Guardar exclusiones</PendingSubmitButton>
  </form>;
}

"use client";

import { useId, useMemo, useState } from "react";
import type { BlogCatalogProduct } from "@/lib/blog-day-plan";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const RESULTS = 30;

function matches(products: BlogCatalogProduct[], query: string, skip: Set<string>) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return products.filter(product => {
    if (skip.has(product.id)) return false;
    const text = normalize(`${product.name} ${product.brand} ${product.category}`);
    return terms.every(term => text.includes(term));
  }).slice(0, RESULTS);
}

/** Buscador de productos del catálogo. `blocked` aparecen deshabilitados con su motivo. */
function ProductSearch({ products, skip, blocked, placeholder, onPick, compact }: { products: BlogCatalogProduct[]; skip: Set<string>; blocked: Map<string, string>; placeholder: string; onPick: (id: string) => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => matches(products, query, skip), [products, query, skip]);
  return <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <input type="search" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" value={query} placeholder={placeholder}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter") { event.preventDefault(); const first = results.find(item => !blocked.has(item.id)); if (first) { onPick(first.id); setQuery(""); setOpen(false); } } }}
      className={`block w-full rounded-lg border border-ink/20 bg-paper font-normal ${compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`} />
    {open ? <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-ink/10 bg-paper py-1 text-sm shadow-lg">
      {results.length ? results.map(product => {
        const reason = blocked.get(product.id);
        return <li key={product.id} role="option" aria-selected={false} aria-disabled={!!reason}>
          <button type="button" disabled={!!reason} onClick={() => { onPick(product.id); setQuery(""); setOpen(false); }}
            className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50">
            <span className="min-w-0 truncate text-ink">{product.name}</span>
            <span className="shrink-0 text-[11px] text-slate">{reason || product.brand}</span>
          </button>
        </li>;
      }) : <li className="px-3 py-2 text-xs text-slate">Sin resultados en el catálogo.</li>}
    </ul> : null}
  </div>;
}

/** Elige un producto protagonista. Vacío = la IA elige según el tema. */
export function ProductPicker({ products, value, onChange, blocked, name, compact }: { products: BlogCatalogProduct[]; value: string; onChange: (id: string) => void; blocked: Map<string, string>; name?: string; compact?: boolean }) {
  const selected = products.find(product => product.id === value);
  const empty = useMemo(() => new Set<string>(), []);
  return <div>
    {name ? <input type="hidden" name={name} value={value} /> : null}
    {selected ? <span className={`inline-flex max-w-full items-center gap-1 rounded-full border border-moss/30 bg-moss/10 font-medium text-moss ${compact ? "px-2 py-1 text-xs" : "px-2.5 py-1 text-sm"}`}>
      <span className="truncate" title={selected.name}>{selected.name}</span>
      <button type="button" aria-label={`Quitar ${selected.name}`} onClick={() => onChange("")} className="shrink-0 rounded-full px-1 hover:bg-moss/20">×</button>
    </span> : <ProductSearch products={products} skip={empty} blocked={blocked} placeholder="Buscar producto…" onPick={onChange} compact={compact} />}
  </div>;
}

/** Lista de productos que no se pueden nombrar, como chips. */
export function ProductMultiPicker({ products, value, onChange, blocked, name, compact, placeholder = "Agregar producto a excluir…" }: { products: BlogCatalogProduct[]; value: string[]; onChange: (ids: string[]) => void; blocked?: Map<string, string>; name?: string; compact?: boolean; placeholder?: string }) {
  const byId = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const skip = useMemo(() => new Set(value), [value]);
  const none = useMemo(() => new Map<string, string>(), []);
  return <div className="space-y-1.5">
    {name ? value.map(id => <input key={id} type="hidden" name={name} value={id} />) : null}
    {value.length ? <div className="flex flex-wrap gap-1">{value.map(id => {
      const label = byId.get(id)?.name || id;
      return <span key={id} className={`inline-flex max-w-full items-center gap-1 rounded-full border border-signal/30 bg-signal/5 text-signal ${compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}>
        <span className="truncate" title={label}>{label}</span>
        <button type="button" aria-label={`Volver a permitir ${label}`} onClick={() => onChange(value.filter(item => item !== id))} className="shrink-0 rounded-full px-1 hover:bg-signal/10">×</button>
      </span>;
    })}</div> : null}
    <ProductSearch products={products} skip={skip} blocked={blocked || none} placeholder={placeholder} onPick={id => onChange([...value, id])} compact={compact} />
  </div>;
}

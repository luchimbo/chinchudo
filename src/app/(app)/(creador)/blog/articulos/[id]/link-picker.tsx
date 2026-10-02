"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { catalogList, cleanLabel, findEntry, MARKER_KIND_LABEL, type ArticleCatalog, type ArticleLinkAttrs, type MarkerKind } from "@/lib/article-markers";

const KINDS: MarkerKind[] = ["p", "c", "g", "s"];
const TAB_LABEL: Record<MarkerKind, string> = { p: "Productos", c: "Categorías", g: "Guías del blog", s: "Fuentes" };

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function LinkPicker({
  catalog,
  initial,
  selectedText,
  onApply,
  onRemove,
  onClose,
}: {
  catalog: ArticleCatalog;
  initial?: ArticleLinkAttrs;
  selectedText?: string;
  onApply: (attrs: ArticleLinkAttrs) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<MarkerKind>(initial?.kind ?? "p");
  const [ref, setRef] = useState(initial?.ref ?? "");
  const [label, setLabel] = useState(initial?.label ?? selectedText ?? "");
  const [query, setQuery] = useState(selectedText ?? "");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const list = catalogList(catalog, kind);
    const matches = words.length ? list.filter((entry) => { const hay = fold(`${entry.name} ${entry.detail ?? ""} ${entry.ref}`); return words.every((word) => hay.includes(word)); }) : list;
    // Si la búsqueda por el texto seleccionado no encuentra nada, mostrar todo.
    return (matches.length || !selectedText || query !== selectedText ? matches : list).slice(0, 60);
  }, [catalog, kind, query, selectedText]);

  const chosen = ref ? findEntry(catalog, kind, ref) : undefined;
  const wasInvalid = initial && !findEntry(catalog, initial.kind, initial.ref);

  function apply() {
    if (!chosen) return;
    const text = cleanLabel(label);
    // Un producto sin texto propio muestra su nombre del catálogo.
    if (kind === "p") onApply({ kind, ref: chosen.ref, label: text && text !== chosen.name ? text : null });
    else onApply({ kind, ref: chosen.ref, label: text || chosen.name });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="link-picker-title" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-paper shadow-2xl sm:rounded-2xl">
        <div className="border-b border-ink/10 px-5 pb-3 pt-4">
          <h2 id="link-picker-title" className="font-display text-lg text-ink">{initial ? "Editar enlace" : "Agregar enlace"}</h2>
          {wasInvalid ? <p className="mt-1 text-xs text-rose-700">El destino actual ({MARKER_KIND_LABEL[initial.kind]} “{initial.ref}”) no está en el catálogo. Elegí uno válido o quitá el enlace.</p> : null}
          <div role="tablist" className="mt-3 flex gap-1 rounded-lg bg-ink/5 p-1">
            {KINDS.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => { setKind(item); setRef(""); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${kind === item ? "bg-paper text-ink shadow-sm" : "text-slate hover:text-ink"}`}>
                {TAB_LABEL[item]} <span className="font-normal opacity-60">{catalogList(catalog, item).length}</span>
              </button>
            ))}
          </div>
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre…" aria-label="Buscar destino"
            className="mt-3 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-moss focus:outline-none" />
        </div>
        <ul role="listbox" aria-label={TAB_LABEL[kind]} className="min-h-[8rem] flex-1 overflow-y-auto px-2 py-2">
          {results.length ? results.map((entry) => (
            <li key={entry.ref}>
              <button type="button" role="option" aria-selected={entry.ref === ref} onClick={() => { setRef(entry.ref); if (!label.trim() && kind !== "p") setLabel(entry.name); }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${entry.ref === ref ? "bg-moss/10 ring-1 ring-moss/40" : "hover:bg-ink/5"}`}>
                <span className="block font-medium text-ink">{entry.name}</span>
                {entry.detail ? <span className="block text-xs text-slate">{entry.detail}</span> : null}
              </button>
            </li>
          )) : <li className="px-3 py-6 text-center text-sm text-slate">{catalogList(catalog, kind).length ? "Sin resultados para esa búsqueda." : kind === "g" ? "Todavía no hay otras guías publicadas." : "El catálogo está vacío."}</li>}
        </ul>
        <div className="space-y-3 border-t border-ink/10 px-5 py-4">
          <label className="grid gap-1 text-xs font-semibold text-slate">
            Texto visible
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={kind === "p" && chosen ? `Si lo dejás vacío: ${chosen.name}` : "Texto del enlace"}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm font-normal text-ink focus:border-moss focus:outline-none" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={apply} disabled={!chosen}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-40">{initial ? "Aplicar" : "Insertar enlace"}</button>
            <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-sm text-slate hover:text-ink">Cancelar</button>
            {onRemove ? <button type="button" onClick={onRemove} className="ml-auto rounded-full px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Quitar enlace</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

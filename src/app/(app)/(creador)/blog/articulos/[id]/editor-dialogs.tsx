"use client";

import { useEffect, type ReactNode } from "react";
import type { ArticleBlock } from "@/lib/article-edit";
import { markersToPlain, type ArticleCatalog } from "@/lib/article-markers";
import { wordDiff } from "@/lib/text-diff";

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full flex-col rounded-2xl bg-paper shadow-2xl ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate hover:bg-ink/5 hover:text-ink" aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ChangesDialog({ changes, catalog, onClose }: { changes: Array<{ before: ArticleBlock; after: ArticleBlock }>; catalog: ArticleCatalog; onClose: () => void }) {
  const plain = (block: ArticleBlock) => (block.rich ? markersToPlain(block.value, catalog) : block.value);
  return (
    <Modal title={`Cambios sin guardar (${changes.length})`} onClose={onClose}>
      <div className="overflow-y-auto px-5 py-4">
        {changes.length ? (
          <ul className="space-y-4">
            {changes.map(({ before, after }) => (
              <li key={after.id}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate">{after.label}</p>
                <p className="whitespace-pre-line rounded-lg border border-ink/10 bg-white p-3 text-sm leading-relaxed text-ink">
                  {wordDiff(plain(before), plain(after)).map((part, index) =>
                    part.type === "same" ? <span key={index}>{part.text}</span>
                      : part.type === "added" ? <ins key={index} className="rounded bg-emerald-100 text-emerald-900 no-underline">{part.text}</ins>
                        : <del key={index} className="rounded bg-rose-100 text-rose-800">{part.text}</del>,
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : <p className="py-6 text-center text-sm text-slate">No hay cambios.</p>}
        <p className="mt-4 text-[11px] text-slate">Verde: texto agregado · Rojo: texto quitado. Los enlaces se muestran por su texto visible.</p>
      </div>
    </Modal>
  );
}

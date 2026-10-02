"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ArticleBlock, ArticleDraft } from "@/lib/article-edit";
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

export function PreviewDialog({ articleId, draft, onClose }: { articleId: string; draft: ArticleDraft; onClose: () => void }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/blog/articles/${encodeURIComponent(articleId)}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
      signal: controller.signal,
    })
      .then(async (response) => { const text = await response.text(); if (!response.ok) throw new Error(text); setHtml(text); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo generar la vista previa."); });
    return () => controller.abort();
    // El borrador se toma al abrir: la vista previa es una foto de ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  return (
    <Modal title="Vista previa exacta" onClose={onClose} wide>
      <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-2 text-xs">
        <span className="text-slate">Así se verá en el blog, con los cambios sin guardar.</span>
        <div className="ml-auto flex gap-1 rounded-lg bg-ink/5 p-1">
          <button type="button" onClick={() => setMobile(false)} aria-pressed={!mobile} className={`rounded-md px-2.5 py-1 font-semibold ${!mobile ? "bg-paper shadow-sm" : "text-slate"}`}>Escritorio</button>
          <button type="button" onClick={() => setMobile(true)} aria-pressed={mobile} className={`rounded-md px-2.5 py-1 font-semibold ${mobile ? "bg-paper shadow-sm" : "text-slate"}`}>Celular</button>
        </div>
      </div>
      <div className="flex min-h-[60vh] flex-1 justify-center overflow-auto bg-ink/[0.04] p-3">
        {error ? <pre className="max-w-full whitespace-pre-wrap p-6 text-sm text-rose-700">{error}</pre>
          : html ? <iframe title="Vista previa del artículo" srcDoc={html} sandbox="allow-same-origin" className={`h-[75vh] rounded-lg border border-ink/10 bg-white shadow-sm ${mobile ? "w-[390px]" : "w-full"}`} />
            : <p className="self-center text-sm text-slate" role="status">Generando vista previa…</p>}
      </div>
    </Modal>
  );
}

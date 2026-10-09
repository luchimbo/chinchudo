"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoadingMessage } from "./loading-ui";
import type { ArticleDraft } from "@/lib/article-edit";

type PreviewProps = { articleId: string; draft?: ArticleDraft; onClose: () => void };

function focusTargets(root: HTMLElement | Document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex], iframe"))
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0)
    .flatMap((element) => {
      if (element instanceof HTMLIFrameElement) {
        try { if (element.contentDocument) return focusTargets(element.contentDocument); } catch { /* Otro origen. */ }
      }
      return [element];
    });
}

export function PreviewDialog({ articleId, draft, onClose }: PreviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const iframeCleanup = useRef<(() => void) | null>(null);
  const closeRef = useRef(onClose);
  const [snapshot] = useState(draft);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const close = useCallback(() => closeRef.current(), []);
  const onKey = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    const dialog = dialogRef.current;
    if (event.key !== "Tab" || !dialog) return;
    const targets = focusTargets(dialog);
    if (!targets.length) return;
    let active = document.activeElement;
    if (active instanceof HTMLIFrameElement) {
      try { active = active.contentDocument?.activeElement || active; } catch { /* Otro origen. */ }
    }
    const index = targets.findIndex((element) => element === active);
    const next = index < 0 ? (event.shiftKey ? targets.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
    event.preventDefault();
    targets[next].focus();
  }, [close]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const origin = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El diálogo nativo mantiene el foco dentro y vuelve inerte el panel.
    dialog.showModal();
    closeButtonRef.current?.focus();
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      iframeCleanup.current?.();
      dialog.close();
      document.body.style.overflow = overflow;
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, [onKey]);

  useEffect(() => {
    const controller = new AbortController();
    setHtml("");
    setError("");
    setFrameReady(false);
    fetch(`/api/blog/articles/${encodeURIComponent(articleId)}/preview`, {
      method: snapshot ? "POST" : "GET",
      ...(snapshot ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: snapshot }) } : {}),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.redirected) throw new Error("La sesión venció. Volvé a iniciar sesión para ver el artículo.");
        const text = await response.text();
        if (!response.ok) throw new Error(text || "No se pudo generar la vista previa.");
        if (!text.trim()) throw new Error("El renderizador devolvió una vista previa vacía.");
        if (!controller.signal.aborted) setHtml(text);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo generar la vista previa.");
      });
    return () => controller.abort();
  }, [articleId, snapshot, attempt]);

  // El teclado dentro del iframe no llega al documento padre. El HTML es del
  // mismo origen, por lo que podemos manejar Tab y Escape sin habilitar scripts.
  function connectIframe(frame: HTMLIFrameElement) {
    iframeCleanup.current?.();
    iframeCleanup.current = null;
    try {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) return;
      frameDocument.addEventListener("keydown", onKey);
      iframeCleanup.current = () => frameDocument.removeEventListener("keydown", onKey);
    } catch { /* Un enlace externo puede cambiar el origen del iframe. */ }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={snapshot ? "Vista previa exacta" : "Vista previa del artículo"}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-6xl flex-col overflow-hidden rounded-2xl border-0 bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40 open:flex sm:w-[calc(100%-3rem)]"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
        <h2 className="font-display text-lg">{snapshot ? "Vista previa exacta" : "Vista previa del artículo"}</h2>
        <button ref={closeButtonRef} type="button" onClick={close} className="rounded-full px-3 py-1 text-sm text-slate hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-moss" aria-label="Cerrar vista previa">✕</button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink/10 px-5 py-2 text-xs">
        <span className="text-slate">{snapshot ? "Así se verá en el blog, con los cambios sin guardar." : "Última versión guardada. Puede incluir cambios pendientes de publicación."}</span>
        <div className="ml-auto flex gap-1 rounded-lg bg-ink/5 p-1" role="group" aria-label="Tamaño de la vista previa">
          <button type="button" onClick={() => setMobile(false)} aria-pressed={!mobile} className={`rounded-md px-2.5 py-1 font-semibold ${!mobile ? "bg-paper shadow-sm" : "text-slate"}`}>Escritorio</button>
          <button type="button" onClick={() => setMobile(true)} aria-pressed={mobile} className={`rounded-md px-2.5 py-1 font-semibold ${mobile ? "bg-paper shadow-sm" : "text-slate"}`}>Celular</button>
        </div>
      </div>
      <div aria-busy={!error && (!html || !frameReady)} className="relative flex min-h-0 flex-1 justify-center overflow-auto bg-ink/[0.04] p-3">
        {error ? (
          <div className="flex min-h-[60dvh] max-w-full flex-col items-center justify-center gap-4 p-4">
            <p role="alert" className="max-w-full whitespace-pre-wrap break-words text-sm text-rose-700">{error}</p>
            <button type="button" onClick={() => { closeButtonRef.current?.focus(); setAttempt((value) => value + 1); }} className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5">Reintentar</button>
          </div>
        ) : html ? (
          <>
            {!frameReady ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper"><LoadingMessage className="text-sm text-slate">Cargando vista previa…</LoadingMessage></div> : null}
            <iframe title="Vista previa del artículo" srcDoc={html} sandbox="allow-same-origin" onLoad={(event) => { connectIframe(event.currentTarget); setFrameReady(true); }} className={`h-[70dvh] max-w-full shrink-0 rounded-lg border border-ink/10 bg-white shadow-sm ${mobile ? "w-[390px]" : "w-full"}`} />
          </>
        ) : <div className="flex min-h-[60dvh] items-center"><LoadingMessage className="text-sm text-slate">Generando vista previa…</LoadingMessage></div>}
      </div>
    </dialog>,
    document.body,
  );
}

export function ArticlePreviewButton({ articleId, className }: { articleId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={className || "rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5"}>Vista previa</button>
      {open ? <PreviewDialog key={articleId} articleId={articleId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

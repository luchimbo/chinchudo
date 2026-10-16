"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Panel lateral con <dialog> nativo: foco atrapado, Escape y clic afuera cierran. Patrón de blog/calendario. */
export function SideSheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby="side-sheet-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
    if (event.key !== "Tab" || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }} className={`fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-y-auto border-0 bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/30 ${wide ? "sm:w-[640px]" : "sm:w-[440px]"}`}>
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/10 bg-paper px-5 py-4">
      <h2 id="side-sheet-title" className="font-display text-lg">{title}</h2>
      <button autoFocus type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-lg hover:bg-ink/5">×</button>
    </header>
    <div className="space-y-5 p-5 sm:p-6">{children}</div>
  </dialog>;
}

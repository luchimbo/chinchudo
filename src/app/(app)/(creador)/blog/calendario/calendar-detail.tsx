"use client";

import { useCallback, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BLOG_PUBLICATION_STARTED, type PublicationStarted } from "@/lib/blog-publications";
import { LoadingSpinner } from "@/components/loading-ui";
import { BLOG_GENERATION_STARTED, type GenerationStarted } from "@/lib/blog-tasks";

export function CalendarDetail({ day, client, dateLabel, closeHref, publicationId, publishing = false, children }: { day: string; client: string; dateLabel: string; closeHref: string; publicationId?: string; publishing?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [closing, startClosing] = useTransition();
  const minimized = useRef(false);
  // Keep the background inert until the URL and server-rendered detail agree.
  // Closing the native dialog first permits reopening a stale, already-closed instance.
  const close = useCallback(() => { if (!closing) startClosing(() => router.push(closeHref, { scroll: false })); }, [closing, closeHref, router]);
  useEffect(() => {
    const started = (event: Event) => {
      if ((event as CustomEvent<PublicationStarted>).detail?.id === publicationId) close();
    };
    window.addEventListener(BLOG_PUBLICATION_STARTED, started);
    const generated = (event: Event) => { const job = (event as CustomEvent<GenerationStarted>).detail; if (job?.day === day && job.client === client) close(); };
    window.addEventListener(BLOG_GENERATION_STARTED, generated);
    if (publishing && !minimized.current) { minimized.current = true; close(); }
    return () => { window.removeEventListener(BLOG_PUBLICATION_STARTED, started); window.removeEventListener(BLOG_GENERATION_STARTED, generated); };
  }, [publicationId, publishing, close, day, client]);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      document.querySelector<HTMLAnchorElement>(`[data-calendar-day="${day}"]`)?.focus({ preventScroll: true });
    };
  }, [day]);
  return <dialog ref={dialog} aria-labelledby="calendar-detail-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
    if (event.key !== "Tab" || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-y-auto border-0 bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/30 sm:w-[440px]">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/10 bg-paper px-5 py-4">
      <h2 id="calendar-detail-title" className="font-display text-lg capitalize">{dateLabel}</h2>
      <button autoFocus type="button" onClick={close} disabled={closing} aria-busy={closing} aria-label="Cerrar detalle" className="rounded-lg px-3 py-2 text-lg hover:bg-ink/5 disabled:opacity-50">{closing ? <LoadingSpinner /> : "×"}</button>
    </header>
    <div className="space-y-5 p-5 sm:p-6">{children}</div>
  </dialog>;
}

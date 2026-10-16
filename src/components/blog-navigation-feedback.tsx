"use client";

import { createPortal } from "react-dom";
import { LoadingSpinner } from "./loading-ui";

/** Feedback inmediato, incluso al cambiar solo los parámetros del calendario. */
export function BlogNavigationFeedback({ href }: { href: string }) {
  if (!href.startsWith("/blog")) return null;
  const destination = new URL(href, "https://panel.local");
  const detail = destination.pathname === "/blog/calendario" && destination.searchParams.has("day");
  const message = detail ? "Cargando día…" : destination.pathname.includes("/articulos/") ? "Preparando editor…" : "Cargando Blog…";
  return createPortal(<div className="pointer-events-none fixed inset-0 z-[80]" data-blog-navigation-loading>
    <div role="status" aria-live="polite" className="absolute left-1/2 top-3 z-10 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full border border-ink/10 bg-paper px-4 py-2 text-xs font-semibold text-ink shadow-lg"><LoadingSpinner />{message}</div>
    <div aria-hidden="true" className="loading-progress-track absolute inset-x-0 top-0 z-10 h-1"><span /></div>
    {detail ? <div aria-hidden="true" className="absolute inset-y-0 right-0 w-full space-y-6 border-l border-ink/10 bg-paper p-6 shadow-2xl sm:w-[440px]">
      <div className="loading-block mt-3 h-5 w-32" /><div className="border-t border-ink/10 pt-6"><div className="loading-block h-6 w-20 rounded-full" /></div>
      <div className="space-y-3"><div className="loading-block h-8 w-full" /><div className="loading-block h-8 w-4/5" /><div className="loading-block h-8 w-2/3" /></div>
      <div className="loading-block h-4 w-40" /><div className="flex gap-3"><div className="loading-block h-10 w-28" /><div className="loading-block h-10 w-32" /></div>
    </div> : null}
  </div>, document.body);
}

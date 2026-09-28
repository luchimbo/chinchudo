import type { ReactNode } from "react";

export function LoadingSpinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`loading-spinner ${className}`} />;
}

export function LoadingMessage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 ${className}`}><LoadingSpinner /><span>{children}</span></span>;
}

export function PageSkeleton({ kind = "dashboard" }: { kind?: "dashboard" | "list" | "form" | "auth" }) {
  if (kind === "auth") return <main role="status" aria-live="polite" className="flex min-h-dvh items-center justify-center px-4">
    <div className="loading-reveal w-full max-w-sm space-y-5 rounded-2xl border border-ink/10 bg-white/80 p-8 shadow-panel">
      <div className="loading-page-indicator"><LoadingSpinner className="loading-spinner-page" /><span>Cargando acceso…</span></div>
      <div aria-hidden="true" className="space-y-5"><div className="loading-block mx-auto h-9 w-40" /><div className="loading-block h-3 w-48" /><div className="loading-block h-11 w-full" /><div className="loading-block h-11 w-full" /><div className="loading-block h-11 w-full rounded-full" /></div>
    </div>
  </main>;

  const message = kind === "list" ? "Cargando resultados…" : kind === "form" ? "Preparando formulario…" : "Cargando panel…";
  return <div role="status" aria-live="polite" className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
    <div className="loading-reveal space-y-7">
      <div className="loading-page-indicator"><LoadingSpinner className="loading-spinner-page" /><span>{message}</span></div>
      <div aria-hidden="true" className="space-y-7">
      <div className="space-y-3"><div className="loading-block h-3 w-28" /><div className="loading-block h-9 w-64 max-w-full" /><div className="loading-block h-3 w-80 max-w-full" /></div>
      {kind === "dashboard" ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-4 rounded-xl border border-ink/10 bg-white/50 p-5"><div className="loading-block h-3 w-24" /><div className="loading-block h-8 w-16" /><div className="loading-block h-3 w-32" /></div>)}</div> : null}
      {kind === "form" ? <div className="max-w-3xl space-y-5 rounded-xl border border-ink/10 bg-white/50 p-6">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><div className="loading-block h-3 w-24" /><div className="loading-block h-11 w-full" /></div>)}<div className="loading-block h-10 w-36 rounded-full" /></div> : <div className="space-y-3 rounded-xl border border-ink/10 bg-white/50 p-5">{Array.from({ length: kind === "list" ? 6 : 4 }, (_, i) => <div key={i} className="flex gap-4 border-b border-ink/5 py-3 last:border-0"><div className="loading-block h-10 w-10 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><div className="loading-block h-4 w-1/3" /><div className="loading-block h-3 w-full" /><div className="loading-block h-3 w-2/3" /></div></div>)}</div>}
      </div>
    </div>
  </div>;
}

import Link from "next/link";
import type { ReactNode } from "react";

/** Encabezado de cada paso: qué es, para qué sirve y la acción principal. */
export function StepHeader({ step, title, description, action }: { step: number; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-[.18em] text-brass">Paso {step} de 5</p>
      <h1 className="mt-1 font-display text-3xl font-bold leading-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">{description}</p>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </header>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-ink/20 bg-white/60 px-6 py-10 text-center">
    <h3 className="font-display text-xl font-bold">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate">{body}</p>
    {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
  </div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink/10 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xs font-black uppercase tracking-wider text-brass">{children}</h2>{hint ? <p className="text-xs text-slate">{hint}</p> : null}</div>;
}

export const primaryButton = "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-black text-paper transition hover:bg-ink/90";
export const secondaryButton = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-4 text-sm font-bold transition hover:border-ink/40";
export const smallButton = "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-ink/15 bg-white px-3 text-xs font-bold transition hover:border-ink/40";

type Light = "good" | "fair" | "poor";
const LIGHT: Record<Light, { label: string; tone: string; dot: string }> = {
  good: { label: "Listo", tone: "bg-moss/15 text-moss", dot: "bg-moss" },
  fair: { label: "Mejorable", tone: "bg-brass/15 text-brass", dot: "bg-brass" },
  poor: { label: "Flojo", tone: "bg-signal/10 text-signal", dot: "bg-signal" },
};

/** Semáforo en vez de puntaje crudo; el número queda en el title. */
export function TrafficLight({ score, label, goodAt = 70, fairAt = 50 }: { score: number; label?: string; goodAt?: number; fairAt?: number }) {
  const light: Light = score >= goodAt ? "good" : score >= fairAt ? "fair" : "poor";
  const item = LIGHT[light];
  return <span title={`${Math.round(score)} de 100`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.tone}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />{label ? `${label}: ` : ""}{item.label}</span>;
}

export const PIECE_TYPE_LABEL: Record<string, string> = { REEL: "Reel", CAROUSEL: "Carrusel", STORY: "Historia" };

export const PIECE_STATUS: Record<string, { label: string; tone: string }> = {
  REVIEW: { label: "Para revisar", tone: "bg-ink/5 text-slate" },
  APPROVED: { label: "Aprobada", tone: "bg-moss/15 text-moss" },
  SCRIPT_READY: { label: "Con guion", tone: "bg-brass/15 text-brass" },
  READY_TO_RECORD: { label: "Lista para grabar", tone: "bg-moss/15 text-moss" },
  RECORDED: { label: "Grabada", tone: "bg-moss/15 text-moss" },
  PUBLISHED: { label: "Publicada", tone: "bg-ink text-paper" },
  DISCARDED: { label: "Descartada", tone: "bg-signal/10 text-signal" },
};

export function Chip({ children, tone = "bg-ink/5 text-slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider ${tone}`}>{children}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const item = PIECE_STATUS[status] ?? { label: status, tone: "bg-ink/5 text-slate" };
  return <Chip tone={item.tone}>{item.label}</Chip>;
}

export function withClient(href: string, client: string) {
  return `${href}${href.includes("?") ? "&" : "?"}client=${encodeURIComponent(client)}`;
}

export function NextStepLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-ink underline decoration-brass decoration-2 underline-offset-4 hover:text-moss">{children} →</Link>;
}

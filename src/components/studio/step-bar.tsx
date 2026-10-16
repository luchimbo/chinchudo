"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PendingNavigationLink } from "@/components/pending-navigation-link";
import type { StudioCounts } from "@/lib/studio/counts";

export const STUDIO_STEPS: { key: keyof StudioCounts; href: string; label: string; hint: string }[] = [
  { key: "inspiracion", href: "/estudio/inspiracion", label: "Inspiración", hint: "Qué funciona afuera" },
  { key: "plan", href: "/estudio/plan", label: "Plan de la semana", hint: "Qué vas a publicar" },
  { key: "guiones", href: "/estudio/guiones", label: "Guiones", hint: "Qué vas a decir" },
  { key: "publicar", href: "/estudio/publicar", label: "Publicar", hint: "Texto y formatos" },
  { key: "resultados", href: "/estudio/resultados", label: "Resultados", hint: "Cómo te fue" },
];

/** Barra de los 5 pasos del Estudio, con pendientes por paso. Conserva ?client=. */
export function StepBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const client = searchParams.get("client");
  const query = client ? `?client=${encodeURIComponent(client)}` : "";
  const [counts, setCounts] = useState<StudioCounts | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/estudio/counts${query}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (active && data && !data.error) setCounts(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [query, pathname]);

  return <nav aria-label="Pasos del Estudio de Reels" className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur">
    <ol className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-5">
      {STUDIO_STEPS.map((step, index) => {
        const active = pathname === step.href || pathname.startsWith(`${step.href}/`);
        const count = counts?.[step.key] ?? 0;
        return <li key={step.href} className="shrink-0">
          <PendingNavigationLink href={`${step.href}${query}`} aria-current={active ? "step" : undefined} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition ${active ? "border-ink font-black text-ink" : "border-transparent font-semibold text-slate/70 hover:text-ink"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${active ? "bg-ink text-paper" : "bg-ink/10 text-ink"}`}>{index + 1}</span>
            <span className="flex flex-col leading-tight"><span>{step.label}</span><span className="hidden text-[10px] font-medium text-slate/70 md:block">{step.hint}</span></span>
            {count > 0 && <span aria-label={`${count} pendientes`} className="rounded-full bg-brass px-1.5 py-0.5 text-[10px] font-black text-paper">{count > 99 ? "99+" : count}</span>}
          </PendingNavigationLink>
        </li>;
      })}
    </ol>
  </nav>;
}

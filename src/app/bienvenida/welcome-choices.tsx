"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WELCOME_CHOICES, welcomeDestination, type FirstUseGoal } from "@/lib/onboarding-welcome";
import { LoadingSpinner } from "@/components/loading-ui";

export function WelcomeChoices({ clientSlug }: { clientSlug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<FirstUseGoal | "skip" | null>(null);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function choose(goal: FirstUseGoal | "") {
    if (submitting.current) return;
    submitting.current = true; setPending(goal || "skip"); setError("");
    try {
      const response = await fetch(`/api/onboarding?client=${encodeURIComponent(clientSlug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "welcome", goal }), signal: AbortSignal.timeout(20_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar tu elección. Volvé a intentarlo.");
      router.push(welcomeDestination(goal, clientSlug)); router.refresh();
    } catch (err) { setError(err instanceof Error && err.name === "TimeoutError" ? "El guardado está demorando. Elegí la opción otra vez para continuar." : err instanceof Error ? err.message : "No se pudo guardar. Intentá de nuevo."); }
    finally { submitting.current = false; setPending(null); }
  }
  return <div aria-busy={pending !== null}>
    {error ? <p role="alert" className="mb-4 rounded-xl border border-signal/25 bg-signal/5 p-4 text-sm text-ink">{error}</p> : null}
    <div className="grid gap-3">{WELCOME_CHOICES.map((choice, index) => <button key={choice.goal} type="button" disabled={pending !== null} onClick={() => void choose(choice.goal)} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-ink/15 bg-white p-5 text-left shadow-sm transition hover:border-moss hover:bg-moss/5 focus:outline-none focus:ring-4 focus:ring-moss/20 disabled:opacity-60 sm:p-6">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-moss/10 text-sm font-bold text-moss">{index + 1}</span>
      <span className="flex-1"><span className="block text-base font-bold text-ink">{choice.title}</span><span className="mt-1 block text-sm leading-relaxed text-slate">{choice.description}</span></span>
      {pending === choice.goal ? <span role="status" aria-label="Guardando tu elección"><LoadingSpinner /></span> : <span aria-hidden="true" className="text-xl text-moss">→</span>}
    </button>)}</div>
    <button type="button" disabled={pending !== null} onClick={() => void choose("")} className="mt-6 min-h-11 rounded-lg px-3 text-sm font-semibold text-moss underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-50">{pending === "skip" ? "Guardando…" : "Ir al panel"}</button>
  </div>;
}

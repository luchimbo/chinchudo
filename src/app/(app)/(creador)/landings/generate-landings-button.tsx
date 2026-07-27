"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateLandingsButton({ clientSlug }: { clientSlug: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [message, setMessage] = useState("");

  async function generate() {
    setState("starting");
    setMessage("Conectando con el generador de contenidos…");
    try {
      const response = await fetch("/api/landings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSlug }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error === "generation_already_running" ? "Ya hay una generación en curso." : data.error || "No se pudo iniciar la generación.");
      }
      setState("running");
      setMessage("Generando borradores de landings. El archivo se actualizará automáticamente.");
      window.setTimeout(() => router.refresh(), 12_000);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar la generación.");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-ink/20 bg-paper/60 p-5">
      <div>
        <p className="font-semibold text-ink">Todavía no hay borradores</p>
        <p className="mt-1 text-sm text-slate">Creá propuestas basadas en las oportunidades de contenido aprobadas para este cliente.</p>
        {message ? <p className={`mt-3 text-xs font-medium ${state === "error" ? "text-signal" : "text-moss"}`} aria-live="polite">{message}</p> : null}
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={state === "starting" || state === "running"}
        className="inline-flex min-w-40 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-slate disabled:cursor-wait disabled:opacity-65"
      >
        {state === "starting" || state === "running" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" aria-hidden="true" /> : null}
        {state === "starting" ? "Iniciando…" : state === "running" ? "Generando…" : "Crear landings"}
      </button>
    </div>
  );
}

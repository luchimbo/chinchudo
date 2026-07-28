"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateLandingsButton({
  clientSlug,
  variant = "empty",
}: {
  clientSlug: string;
  variant?: "empty" | "editor";
}) {
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

  const isEditor = variant === "editor";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl p-5 ${
      isEditor ? "border border-ink/10 bg-ink text-paper shadow-sm" : "border border-dashed border-ink/20 bg-paper/60"
    }`}>
      <div>
        <p className={`font-semibold ${isEditor ? "text-paper" : "text-ink"}`}>
          {isEditor ? "Crear nuevas landings" : "Todavía no hay borradores"}
        </p>
        <p className={`mt-1 text-sm ${isEditor ? "text-paper/65" : "text-slate"}`}>
          Creá propuestas basadas en las oportunidades de contenido aprobadas para este cliente.
        </p>
        {message ? <p className={`mt-3 text-xs font-medium ${state === "error" ? "text-signal" : "text-moss"}`} aria-live="polite">{message}</p> : null}
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={state === "starting" || state === "running"}
        className={`inline-flex min-w-40 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-65 ${
          isEditor ? "bg-paper text-ink hover:bg-paper/85" : "bg-ink text-paper hover:bg-slate"
        }`}
      >
        {state === "starting" || state === "running" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" aria-hidden="true" /> : null}
        {state === "starting" ? "Iniciando…" : state === "running" ? "Generando…" : "Crear landings"}
      </button>
    </div>
  );
}

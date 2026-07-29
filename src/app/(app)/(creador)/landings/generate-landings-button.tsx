"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const [limit, setLimit] = useState(3);
  const [job, setJob] = useState<any>(null);
  const completedJobRef = useRef("");

  useEffect(() => {
    const refresh = async () => {
      const response = await fetch(`/api/landings/generation-status?client=${encodeURIComponent(clientSlug)}`);
      if (!response.ok) return;
      const data = await response.json();
      const nextJob = data.job;
      if (nextJob?.state === "running") {
        completedJobRef.current = "";
        setJob(nextJob);
        setState("running");
        return;
      }
      // Los resultados terminados pertenecen a la corrida anterior. No se
      // muestran al volver al editor: las landings ya están en su listado.
      setJob(null);
      if (!nextJob) {
        setState("idle");
        return;
      }
      const jobKey = `${nextJob.startedAt || ""}:${nextJob.finishedAt || ""}:${nextJob.state}`;
      if (completedJobRef.current !== jobKey) {
        completedJobRef.current = jobKey;
        router.refresh();
      }
      if (nextJob.state === "failed") {
        setState("error");
        setMessage(nextJob.errors?.[0] || "La generación no pudo completarse.");
      } else {
        setState("idle");
        setMessage("");
      }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer);
  }, [clientSlug]);

  async function generate() {
    setState("starting");
    setMessage("Conectando con el generador de contenidos…");
    try {
      const response = await fetch("/api/landings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSlug, limit }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error === "generation_already_running" ? "Ya hay una generación en curso." : data.error || "No se pudo iniciar la generación.");
      }
      setState("running");
      setJob({ state: "running", requested: limit, completed: 0, currentTopic: "Preparando temas…", created: [] });
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
        {job ? <div className="mt-4 rounded-lg border border-white/15 bg-black/15 p-3 text-xs text-paper/80">
          <div className="flex justify-between gap-4"><span>{job.state === "running" ? "En curso" : job.state === "completed" ? "Completada" : "Con errores"}</span><strong>{job.completed || 0}/{job.requested || limit}</strong></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-paper transition-all" style={{ width: `${Math.min(100, ((job.completed || 0) / Math.max(1, job.requested || limit)) * 100)}%` }} /></div>
          {job.currentTopic ? <p className="mt-3 text-paper/65">Tema actual: <span className="text-paper">{job.currentTopic}</span></p> : null}
          {job.created?.length ? <ul className="mt-3 space-y-1 border-t border-white/10 pt-2">{job.created.map((item: any, index: number) => <li key={`${item.title}-${index}`}><span className="text-paper/55">{item.keyword}</span> — {item.title}</li>)}</ul> : null}
        </div> : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={`grid gap-1 text-xs font-semibold ${isEditor ? "text-paper/70" : "text-slate"}`}>
          Cantidad
          <input
            type="number"
            min="1"
            max="5"
            value={limit}
            onChange={(event) => setLimit(Math.max(1, Math.min(5, Number(event.target.value) || 1)))}
            disabled={state === "starting" || state === "running"}
            className="h-11 w-20 rounded-lg border border-ink/15 bg-paper px-3 text-sm font-bold text-ink"
          />
        </label>
        <button
          type="button"
          onClick={generate}
          disabled={state === "starting" || state === "running"}
          className={`inline-flex min-w-40 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-65 ${
            isEditor ? "bg-paper text-ink hover:bg-paper/85" : "bg-ink text-paper hover:bg-slate"
          }`}
        >
          {state === "starting" || state === "running" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" /> : null}
          {state === "starting" ? "Iniciando…" : state === "running" ? "Generando…" : "Crear landings"}
        </button>
        {isEditor ? <Link href={`/landings/config?client=${encodeURIComponent(clientSlug)}`} className="pb-3 text-xs font-semibold text-paper/70 underline underline-offset-4 hover:text-paper">Automatizar</Link> : null}
      </div>
    </div>
  );
}

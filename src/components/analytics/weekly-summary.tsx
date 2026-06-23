"use client";

import { useState } from "react";

export function WeeklySummary() {
  const [text, setText]       = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string>("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setText("");
    try {
      // Propaga el cliente activo (?client=slug) para que el resumen use su key de OpenRouter.
      const clientSlug = new URLSearchParams(window.location.search).get("client") ?? "";
      const url = clientSlug ? `/api/analytics/summary?client=${encodeURIComponent(clientSlug)}` : "/api/analytics/summary";
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setText(json.summary);
    } catch (e: any) {
      setError(e.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white/70 p-6 shadow-panel backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-ink">Resumen semanal</h2>
          <p className="mt-0.5 text-xs text-slate/70">
            Generado por IA a partir de los datos actuales del sistema
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-paper shadow transition hover:-translate-y-0.5 hover:bg-slate disabled:opacity-50 disabled:translate-y-0"
        >
          {loading ? "Generando…" : "Generar resumen"}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-signal/10 px-4 py-3 text-sm text-signal">{error}</p>
      )}

      {text && (
        <div className="mt-2 rounded-md border border-ink/8 bg-paper/60 px-5 py-4 text-sm leading-7 text-ink whitespace-pre-wrap">
          {text}
        </div>
      )}

      {!text && !loading && !error && (
        <p className="text-sm text-slate/50 italic">
          Presioná el botón para generar el resumen de la semana.
        </p>
      )}
    </div>
  );
}

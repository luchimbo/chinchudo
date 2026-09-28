"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/loading-ui";

export function ReportStatusButton({ id, status }: { id: string; status: "OPEN" | "RESOLVED" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const next = status === "OPEN" ? "RESOLVED" : "OPEN";

  async function changeStatus() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/issue-reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!response.ok) throw new Error("No se pudo actualizar el reporte.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el reporte.");
    } finally { setPending(false); }
  }

  return <span className="inline-flex flex-col gap-1"><button type="button" onClick={changeStatus} disabled={pending} className={`rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${status === "OPEN" ? "bg-moss text-white hover:bg-[#405436]" : "border border-ink/20 text-slate hover:text-ink"}`}>
    {pending ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Actualizando…</span> : status === "OPEN" ? "Marcar resuelto" : "Reabrir"}
  </button>{error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}</span>;
}

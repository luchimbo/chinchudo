"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReportStatusButton({ id, status }: { id: string; status: "OPEN" | "RESOLVED" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const next = status === "OPEN" ? "RESOLVED" : "OPEN";

  async function changeStatus() {
    setPending(true);
    try {
      const response = await fetch(`/api/issue-reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } finally { setPending(false); }
  }

  return <button type="button" onClick={changeStatus} disabled={pending} className={`rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${status === "OPEN" ? "bg-moss text-white hover:bg-[#405436]" : "border border-ink/20 text-slate hover:text-ink"}`}>
    {pending ? "Actualizando…" : status === "OPEN" ? "Marcar resuelto" : "Reabrir"}
  </button>;
}

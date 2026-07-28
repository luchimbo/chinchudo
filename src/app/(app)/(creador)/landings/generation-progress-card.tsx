"use client";

import { useEffect, useState } from "react";

type Job = { state: "running" | "completed" | "failed"; requested: number; completed: number; currentTopic?: string; created?: Array<{ keyword: string; title: string; source?: string }> };

export function GenerationProgressCard({ clientSlug }: { clientSlug: string }) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    const refresh = async () => {
      const response = await fetch(`/api/landings/generation-status?client=${encodeURIComponent(clientSlug)}`);
      if (!response.ok) return;
      const data = await response.json();
      setJob(data.job);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [clientSlug]);

  if (!job || job.state !== "running") return null;
  const percent = Math.min(100, Math.round((job.completed / Math.max(1, job.requested)) * 100));

  return <section className="mb-6 rounded-xl border border-sky-300/70 bg-sky-50 p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold text-sky-900">Generación en proceso</p><p className="mt-1 text-sm text-sky-800/75">{job.currentTopic || "Preparando temas…"}</p></div>
      <span className="rounded-full bg-sky-700 px-3 py-1 text-xs font-bold text-white">{job.completed}/{job.requested}</span>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-sky-200"><div className="h-full bg-sky-600 transition-all duration-500" style={{ width: `${percent}%` }} /></div>
    {job.created?.length ? <div className="mt-4 border-t border-sky-200 pt-3 text-sm text-sky-950"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-700">Landings creadas</p>{job.created.map((item, index) => <p key={`${item.title}-${index}`}><span className="text-sky-700">{item.keyword}</span> — {item.title}{item.source ? <small className="ml-2 text-sky-700/65">({item.source === "internal" ? "conocimiento propio" : "investigación externa"})</small> : null}</p>)}</div> : null}
  </section>;
}

"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { BlogTaskJob } from "@/lib/blog-tasks";
export function LiveCalendarSlot({ client, day, id, title, label, style, children }: { client: string; day: string; id?: string; title: string; label: string; style: string; children: ReactNode }) {
  const [live, setLive] = useState<BlogTaskJob | null>(null);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ client: string; jobs: BlogTaskJob[] }>).detail;
      if (detail.client !== client) return;
      const job = detail.jobs.find(job => id ? job.id === id : job.day === day);
      if (job) setLive(job);
    };
    window.addEventListener("blog-jobs-updated", changed);
    return () => window.removeEventListener("blog-jobs-updated", changed);
  }, [client, day, id]);
  if (!id && !live) return null;
  const labels: Record<string, string> = { READY: live?.requiresApproval ? "Por aprobar" : "Listo", PUBLISHED: "Publicado", PUBLISHING: "Publicando", FAILED: "Bloqueado", SKIPPED: "Omitido", WAITING: "En espera", GENERATING: "Generando", REVIEWING: "Revisando calidad" };
  return <><p className="line-clamp-2 break-words text-[10px] font-semibold leading-snug text-ink sm:line-clamp-3 sm:text-xs">{live?.title || title}</p>{children}<span className={`mt-1.5 inline-flex max-w-full self-start truncate rounded border px-1 py-0.5 text-[9px] font-medium sm:px-1.5 sm:text-[10px] ${live ? "border-ink/15 bg-paper text-ink" : style}`}>{live ? labels[live.phase] || labels[live.status] || label : label}</span></>;
}

"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useVisiblePoll } from "@/lib/use-visible-poll";

type Job = { id: string; opportunityId: string; status: string; error: string; updatedAt: string };
const Runtime = createContext({ client: "", optimized: false, queue: false, jobs: [] as Job[], online: true, notify: (_id: string) => {} });
export const useCMRuntime = () => useContext(Runtime);
export async function enqueueCM(formData: FormData, client: string, action: "generate" | "regenerate") {
  const input: Record<string, unknown> = { client, action, idempotencyKey: crypto.randomUUID(), opportunityId: formData.get("opportunityId") };
  for (const key of ["responseId", "productId"]) if (formData.has(key)) input[key] = formData.get(key);
  if (formData.has("chatHistory")) input.chatHistory = JSON.parse(String(formData.get("chatHistory")));
  const response = await fetch("/api/cm/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo solicitar la propuesta.");
  window.dispatchEvent(new CustomEvent("cm-job-created", { detail: result.id }));
}
export function CMRuntime({ children, client, optimized, queue }: { children: ReactNode; client: string; optimized: boolean; queue: boolean }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => { const created = () => setRevision(n => n + 1); window.addEventListener("cm-job-created", created); return () => window.removeEventListener("cm-job-created", created); }, []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set<string>());
  const notify = (id: string) => window.dispatchEvent(new CustomEvent("cm-opportunity-changed", { detail: id }));
  useVisiblePoll<{ jobs: Job[]; workerOnline: boolean }>(queue && client ? `/api/cm/jobs?client=${encodeURIComponent(client)}&revision=${revision}` : null, result => {
    setJobs(result.jobs); setOnline(result.workerOnline);
    for (const job of result.jobs) if (job.status === "SUCCEEDED" && !seen.current.has(job.id)) { seen.current.add(job.id); notify(job.opportunityId); }
  }, jobs.some(job => ["QUEUED", "RUNNING"].includes(job.status)));
  return <Runtime.Provider value={{ client, optimized, queue, jobs, online, notify }}>{children}</Runtime.Provider>;
}
export function CMJobStatus({ opportunityId }: { opportunityId: string }) {
  const { jobs, online } = useCMRuntime();
  const job = jobs.find(j => j.opportunityId === opportunityId);
  if (!job || job.status === "SUCCEEDED") return null;
  return <p role="status" className="mb-3 rounded-lg bg-paper p-3 text-xs text-slate">{job.status === "QUEUED" ? online ? "Propuesta en cola. Podés seguir trabajando." : "En espera del procesador" : job.status === "RUNNING" ? "Generando propuesta en segundo plano…" : job.error}</p>;
}

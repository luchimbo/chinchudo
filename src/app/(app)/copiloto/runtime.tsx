"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import { LoadingSpinner } from "@/components/loading-ui";

type Job = { id: string; opportunityId: string; status: string; error: string; updatedAt: string };
const Runtime = createContext({ client: "", jobs: [] as Job[], requested: [] as string[], online: true, notify: (_id: string) => {} });
export const useCMRuntime = () => useContext(Runtime);
export async function enqueueCM(formData: FormData, client: string, action: "generate" | "regenerate") {
  const input: Record<string, unknown> = { client, action, idempotencyKey: crypto.randomUUID(), opportunityId: formData.get("opportunityId") };
  for (const key of ["responseId", "productId"]) if (formData.has(key)) input[key] = formData.get(key);
  if (formData.has("chatHistory")) input.chatHistory = JSON.parse(String(formData.get("chatHistory")));
  const response = await fetch("/api/cm/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo solicitar la propuesta.");
  window.dispatchEvent(new CustomEvent("cm-job-created", { detail: { id: result.id, opportunityId: String(input.opportunityId) } }));
}
export function CMRuntime({ children, client }: { children: ReactNode; client: string }) {
  const [revision, setRevision] = useState(0);
  // Pedidos enviados que el sondeo todavía no trajo: se muestran ya, para que no parezca que no pasó nada.
  const [pendingRequests, setPendingRequests] = useState<{ id: string; opportunityId: string }[]>([]);
  const requested = pendingRequests.map(request => request.opportunityId);
  useEffect(() => {
    const created = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; opportunityId?: string }>).detail;
      if (detail?.id && detail.opportunityId) setPendingRequests(current => [...current.filter(request => request.id !== detail.id), { id: detail.id!, opportunityId: detail.opportunityId! }]);
      setRevision(n => n + 1);
    };
    window.addEventListener("cm-job-created", created); return () => window.removeEventListener("cm-job-created", created);
  }, []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set<string>());
  const notify = (id: string) => window.dispatchEvent(new CustomEvent("cm-opportunity-changed", { detail: id }));
  useVisiblePoll<{ jobs: Job[]; workerOnline: boolean }>(client ? `/api/cm/jobs?client=${encodeURIComponent(client)}&revision=${revision}` : null, result => {
    setJobs(result.jobs); setOnline(result.workerOnline);
    setPendingRequests(current => current.length ? current.filter(request => !result.jobs.some(job => job.id === request.id)) : current);
    for (const job of result.jobs) if (job.status === "SUCCEEDED" && !seen.current.has(job.id)) { seen.current.add(job.id); notify(job.opportunityId); }
  }, requested.length > 0 || jobs.some(job => ["QUEUED", "RUNNING"].includes(job.status)));
  return <Runtime.Provider value={{ client, jobs, requested, online, notify }}>{children}</Runtime.Provider>;
}
/** Hay un pedido de propuesta en curso para esta oportunidad (enviado, en cola o generándose). */
export function useCMJobBusy(opportunityId: string) {
  const { jobs, requested } = useCMRuntime();
  return requested.includes(opportunityId) || jobs.some(job => job.opportunityId === opportunityId && ["QUEUED", "RUNNING"].includes(job.status));
}
export function CMJobStatus({ opportunityId }: { opportunityId: string }) {
  const { jobs, requested, online } = useCMRuntime();
  const job = jobs.find(j => j.opportunityId === opportunityId);
  const active = job && ["QUEUED", "RUNNING"].includes(job.status);
  if (!active && requested.includes(opportunityId)) return <Notice busy>Pedido enviado. Preparando la propuesta…</Notice>;
  if (!job || job.status === "SUCCEEDED") return null;
  if (job.status === "QUEUED") return <Notice busy={online}>{online ? "Propuesta en cola. Podés seguir trabajando con otras oportunidades." : "En espera del procesador: la propuesta se genera apenas vuelva a estar en línea."}</Notice>;
  if (job.status === "RUNNING") return <Notice busy>Generando propuesta con la IA… suele tardar menos de un minuto.</Notice>;
  return <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{job.error || "No se pudo generar la propuesta."}</p>;
}
function Notice({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return <p role="status" aria-live="polite" className="mb-3 flex items-center gap-2 rounded-lg border border-moss/20 bg-moss/[0.06] p-3 text-xs font-semibold text-ink">{busy ? <LoadingSpinner /> : null}{children}</p>;
}

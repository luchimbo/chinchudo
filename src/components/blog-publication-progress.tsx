"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BLOG_PUBLICATION_STARTED, type PublicationStarted } from "@/lib/blog-publications";
import { BLOG_GENERATION_STARTED, taskIsTerminal, type GenerationStarted, type BlogTaskJob } from "@/lib/blog-tasks";
import { PendingNavigationLink as Link } from "./pending-navigation-link";
import { GenerationActionButton } from "@/app/(app)/(creador)/blog/calendario/generation-action-button";
import { retryBlogPreparation } from "@/app/(app)/(creador)/blog/calendario/actions";
import { PublishArticleButton } from "@/app/(app)/(creador)/blog/calendario/publish-article-button";
import { argentinaDate } from "@/lib/blog-calendar";

export function BlogPublicationProgress({ client, raised = false }: { client: string; raised?: boolean }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<BlogTaskJob[]>([]);
  const [offline, setOffline] = useState(false);
  const tracked = useRef<string[]>([]);
  const dismissed = useRef(new Set<string>());
  const jobsRef = useRef<BlogTaskJob[]>([]);
  const versions = useRef(new Map<string, number>());
  const storageKey = `blog-publications:${client}`;
  const persist = useCallback(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(tracked.current)); } catch { /* Storage may be unavailable; server jobs remain discoverable. */ } }, [storageKey]);

  useEffect(() => {
    let stopped = false, running = false, queued = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]"); tracked.current = Array.isArray(saved) ? saved.filter(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id)).slice(0, 20) : []; } catch { tracked.current = []; }
    const poll = async () => {
      if (stopped || running) return;
      running = true; queued = false; clearTimeout(timer);
      const requestedIds = [...tracked.current];
      const requestedVersions = new Map(versions.current);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      try {
        const query = new URLSearchParams({ client, ids: tracked.current.join(",") });
        const response = await fetch(`/api/blog/jobs?${query}`, { signal: controller.signal, cache: "no-store" });
        if (response.status === 401 || response.status === 403) { if (!stopped) { jobsRef.current = []; setJobs([]); } return; }
        if (!response.ok) throw new Error("No se pudo consultar la publicación.");
        const result = await response.json() as { jobs: BlogTaskJob[] };
        if (stopped) return;
        for (const job of result.jobs) if (!taskIsTerminal(job)) dismissed.current.delete(job.id);
        const next = result.jobs.filter(job => !dismissed.current.has(job.id) && requestedVersions.get(job.id) === versions.current.get(job.id));
        // A publication can be accepted while an older status request is in flight.
        next.push(...jobsRef.current.filter(job => (!requestedIds.includes(job.id) || requestedVersions.get(job.id) !== versions.current.get(job.id)) && !next.some(received => received.id === job.id) && !dismissed.current.has(job.id)));
        const changed = next.some(job => !jobsRef.current.some(previous => previous.id === job.id && previous.status === job.status && previous.phase === job.phase && previous.requiresApproval === job.requiresApproval));
        tracked.current = [...new Set([...next.map(job => job.id), ...tracked.current])].slice(0, 20);
        persist(); jobsRef.current = next; setJobs(next); setOffline(false);
        if (changed) router.refresh();
      } catch { if (!stopped) setOffline(true); }
      finally {
        clearTimeout(timeout); running = false;
        if (!stopped) timer = setTimeout(poll, queued ? 0 : jobsRef.current.some(job => !taskIsTerminal(job)) ? 5_000 : 20_000);
      }
    };
    const started = (event: Event) => {
      const detail = (event as CustomEvent<PublicationStarted>).detail;
      if (!detail || detail.client !== client) return;
      versions.current.set(detail.id, (versions.current.get(detail.id) || 0) + 1);
      dismissed.current.delete(detail.id);
      tracked.current = [...new Set([detail.id, ...tracked.current])].slice(0, 20); persist();
      const current = jobsRef.current.filter(job => job.id !== detail.id);
      const next: BlogTaskJob[] = [{ id: detail.id, title: detail.title, status: "PUBLISHING", phase: "PUBLISHING", operation: "publication", day: "", landingId: null, requiresApproval: false, revision: false, issue: null, error: "", url: null, updatedAt: new Date().toISOString() }, ...current];
      jobsRef.current = next; setJobs(next); setOffline(false); queued = true; void poll();
    };
    window.addEventListener(BLOG_PUBLICATION_STARTED, started);
    const generating = (event: Event) => {
      const detail = (event as CustomEvent<GenerationStarted>).detail;
      if (!detail || detail.client !== client) return;
      versions.current.set(detail.id, (versions.current.get(detail.id) || 0) + 1);
      dismissed.current.delete(detail.id);
      tracked.current = [...new Set([detail.id, ...tracked.current])].slice(0, 20); persist();
      const next: BlogTaskJob[] = [{ id: detail.id, title: detail.title || "Artículo del blog", status: "PLANNED", phase: "WAITING", operation: "generation", day: detail.day, landingId: null, requiresApproval: false, revision: false, issue: null, error: "", url: null, updatedAt: new Date().toISOString() }, ...jobsRef.current.filter(job => job.id !== detail.id)];
      jobsRef.current = next; setJobs(next); setOffline(false); queued = true; void poll();
    };
    window.addEventListener(BLOG_GENERATION_STARTED, generating);
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); window.removeEventListener(BLOG_PUBLICATION_STARTED, started); window.removeEventListener(BLOG_GENERATION_STARTED, generating); };
  // A keyed mount in AppShell isolates each client's in-flight requests and state.
  }, [client, router, storageKey, persist]);

  const dismiss = (id: string) => {
    dismissed.current.add(id); tracked.current = tracked.current.filter(value => value !== id); persist();
    jobsRef.current = jobsRef.current.filter(job => job.id !== id); setJobs(jobsRef.current);
  };
  if (!jobs.length) return null;
  const priority = (job: BlogTaskJob) => taskIsTerminal(job) ? 2 : job.phase === "WAITING" ? 1 : 0;
  const visible = [...jobs].sort((a, b) => priority(a) - priority(b)).slice(0, 3);
  return <aside aria-label="Tareas del blog" className={`fixed right-3 z-40 max-h-[55dvh] w-[calc(100%-24px)] max-w-sm space-y-2 overflow-y-auto sm:right-5 ${raised ? "bottom-20" : "bottom-4"}`}>
    <style jsx global>{`
      @keyframes blog-publication-slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
      .blog-publication-indicator { animation: blog-publication-slide 1.5s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .blog-publication-indicator { animation: none; transform: translateX(75%); } }
    `}</style>
    {visible.map(job => {
      const done = job.status === "PUBLISHED", failed = job.status === "FAILED", ready = job.status === "READY", omitted = job.status === "SKIPPED", terminal = taskIsTerminal(job);
      const label = done ? "Artículo publicado" : failed ? job.operation === "generation" ? "Artículo necesita revisión" : "No se pudo publicar" : ready ? job.requiresApproval ? "Pendiente de aprobación" : "Artículo preparado" : omitted ? "Fecha omitida" : job.operation === "publication" ? "Publicando en segundo plano" : ({ WAITING: "En espera", GENERATING: "Generando", REVIEWING: "Revisando calidad" }[job.phase] || "En espera");
      const detailHref = `/blog/calendario?${new URLSearchParams({ client, ...(job.day ? { month: job.day.slice(0, 7), day: job.day } : {}) })}`;
      return <section key={job.id} className="rounded-xl border border-ink/15 bg-paper p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0">
          <p role="status" aria-live="polite" className={`text-xs font-semibold ${done || ready ? "text-moss" : failed ? "text-signal" : "text-ink"}`}>{label}</p>
          {job.day ? <p className="mt-1 text-xs text-slate">{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${job.day}T00:00:00Z`))}</p> : null}
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{job.title}</p>
        </div>{terminal ? <button type="button" aria-label="Cerrar aviso de tarea" onClick={() => dismiss(job.id)} className="shrink-0 rounded px-2 py-1 text-slate hover:bg-ink/5">×</button> : null}</div>
        {!terminal ? <><div role="progressbar" aria-label="Tarea en curso" aria-valuetext={offline ? "Sin conexión. Reintentando." : label} className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="blog-publication-indicator h-full w-2/5 rounded-full bg-moss" /></div><p className="mt-2 text-xs text-slate">{offline ? "Sin conexión. Seguimos intentando consultar el estado." : "Podés seguir trabajando. Te avisamos cuando termine."}</p><Link href={detailHref} className="mt-2 inline-block text-xs font-semibold text-moss underline">Ver día</Link></> : null}
        {!terminal && job.issue?.action === "connection" ? <div className="mt-2 text-xs text-signal"><p>{job.issue.message}</p><Link href={`/blog/configuracion?client=${encodeURIComponent(client)}`} className="mt-1 inline-block font-semibold underline">Revisar conexión</Link></div> : null}
        {ready ? <div className="mt-3 flex gap-3 text-xs font-semibold text-moss"><Link href={detailHref} className="underline">Ver día</Link>{job.landingId ? <Link href={`/blog/articulos/${job.landingId}?${new URLSearchParams({ client, calendarMonth: job.day.slice(0, 7), calendarDay: job.day })}`} className="underline">Editar artículo</Link> : null}</div> : null}
        {done && job.url ? <a href={job.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-moss underline underline-offset-2">Ver artículo ↗</a> : null}
        {failed ? <><p className="mt-2 break-words text-xs text-signal">{job.issue?.message || "La tarea necesita revisión."}</p>{job.error ? <details className="mt-2 text-xs text-slate"><summary className="cursor-pointer">Detalle del error</summary><p className="mt-1 whitespace-pre-wrap break-words">{job.error}</p></details> : null}<Link className="mt-2 inline-block text-xs font-semibold text-moss underline" href={job.issue?.action === "connection" ? `/blog/configuracion?client=${encodeURIComponent(client)}` : job.issue?.action === "edit" && job.landingId ? `/blog/articulos/${job.landingId}?${new URLSearchParams({ client, calendarMonth: job.day.slice(0, 7), calendarDay: job.day })}` : detailHref}>{job.issue && ["edit", "connection"].includes(job.issue.action) ? job.issue.label : "Ver detalle y resolver"}</Link></> : null}
        {failed && job.issue?.action === "retry-generation" && !job.landingId && (job.day > argentinaDate() || job.requiresApproval) ? <div className="mt-3"><GenerationActionButton id={job.id} day={job.day} client={client} label="Reintentar preparación" action={retryBlogPreparation} kind="retry" /></div> : null}
        {failed && job.issue?.action === "retry-publication" && job.landingId && !job.requiresApproval ? <div className="mt-3"><PublishArticleButton id={job.id} publishing={false} title={job.title} client={client} retry revision={job.revision} /></div> : null}
      </section>;
    })}
  </aside>;
}

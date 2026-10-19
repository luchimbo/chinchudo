"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingMessage } from "@/components/loading-ui";
import { generateBlogDate, type GenerateDateState } from "./actions";
import { notifyGenerationStarted, preparationLabel } from "@/lib/blog-tasks";
import { BLOG_LANGUAGES, type BlogLanguage } from "@/lib/blog-language";

export function PreparationStatus({ preparation, backgroundTracking = false }: { preparation?: unknown; backgroundTracking?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (backgroundTracking) return;
    const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [router, backgroundTracking]);
  return <div className="space-y-3 text-sm text-slate"><LoadingMessage>{preparationLabel(preparation)}…</LoadingMessage><div role="progressbar" aria-label="Preparación del artículo" aria-valuetext="Preparación en segundo plano" className="loading-progress-track h-1.5 rounded-full"><span /></div><p>Podés seguir trabajando; este día se actualizará cuando esté listo.</p></div>;
}

export function GenerateDateForm({ clientId, day, language = "es", comparison }: { clientId: string; day: string; language?: BlogLanguage; comparison?: boolean }) {
  const [state, setState] = useState<GenerateDateState>({ error: null, queued: false });
  const [pending, setPending] = useState(false);
  if (state.queued) return <PreparationStatus backgroundTracking />;
  return <form onSubmit={async event => {
    event.preventDefault(); if (pending) return;
    const data = new FormData(event.currentTarget); setPending(true);
    try {
      const result = await generateBlogDate({ error: null, queued: false }, data);
      // Revalidation may remove this form before a state effect can run.
      // The accepted request still owns this continuation and must notify both listeners.
      if (result.queued && result.id && result.client) notifyGenerationStarted({ id: result.id, client: result.client, day });
      setState(result);
    } catch { setState({ error: "No se pudo solicitar el artículo. Verificá tu acceso y reintentá.", queued: false }); }
    finally { setPending(false); }
  }} className="space-y-3">
    <input type="hidden" name="clientId" value={clientId} />
    <input type="hidden" name="scheduledDate" value={day} />
    <label className="block text-sm font-medium text-ink">Idioma del artículo
      <select name="language" defaultValue={language} className="mt-1 block w-full rounded-lg border border-ink/20 bg-paper px-3 py-2">{BLOG_LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </label>
    {comparison !== undefined ? <label className="flex items-start gap-2 text-sm text-ink"><input type="hidden" name="comparisonOffered" value="1" /><input type="checkbox" name="comparison" defaultChecked={comparison} className="mt-1" /><span>Comparar con un producto de otra marca<span className="block text-xs text-slate">Se elige automáticamente; las ventajas propias salen de las fichas verificadas.</span></span></label> : null}
    <p className="text-sm text-slate">Se preparará un artículo para este día, con los controles de calidad habituales.</p>
    <button type="submit" disabled={pending} aria-busy={pending} className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-paper disabled:cursor-wait disabled:opacity-60">{pending ? <LoadingMessage>Solicitando…</LoadingMessage> : "Generar artículo"}</button>
    {state.error ? <p role="alert" className="text-sm text-signal">{state.error}</p> : null}
  </form>;
}

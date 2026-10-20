"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { publishCalendarArticle, retryBlogDeployment } from "./actions";
import { notifyPublicationStarted } from "@/lib/blog-publications";
import { LoadingMessage } from "@/components/loading-ui";
import { PendingNavigationLink as Link } from "@/components/pending-navigation-link";

export function PublishArticleButton({ id, publishing, title = "Artículo del blog", client, retry = false, revision = false, confirmMessage }: { id: string; publishing: boolean; title?: string; client?: string; retry?: boolean; revision?: boolean; confirmMessage?: string }) {
  const params = useSearchParams();
  const clientSlug = client || params.get("client") || "";
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [asking, setAsking] = useState(false);

  async function publish() {
    setAsking(false);
    setPending(true);
    setError("");
    setConnectionError(false);
    try {
      const result = await (revision ? retryBlogDeployment(id) : publishCalendarArticle(id));
      if (!result.ok) { setError(result.error); setConnectionError("code" in result && result.code === "CONNECTION"); return; }
      setAccepted(true);
      notifyPublicationStarted({ id, client: clientSlug, title });
    } catch {
      setError("No se pudo iniciar la publicación. Recargá el calendario y reintentá.");
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-1">
    <button type="button" disabled={pending || publishing || accepted || asking} aria-busy={pending || publishing || accepted}
      className="w-full rounded-lg bg-moss px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-moss/90 disabled:cursor-wait disabled:opacity-60"
      onClick={() => { if (confirmMessage) setAsking(true); else void publish(); }}>
      {pending || publishing || accepted ? <LoadingMessage>{pending ? "Iniciando…" : "Publicando…"}</LoadingMessage> : retry ? "Reintentar publicación" : "Publicar artículo"}
    </button>
    {asking && confirmMessage ? <div role="alertdialog" aria-label="Confirmar publicación" className="space-y-2 rounded-lg border border-brass/30 bg-brass/10 p-2 text-xs text-ink">
      <p>{confirmMessage}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void publish()} className="rounded-lg bg-moss px-2 py-1 font-semibold text-white">Publicar hoy</button>
        <button type="button" onClick={() => setAsking(false)} className="rounded-lg border border-ink/15 px-2 py-1 font-semibold text-ink">Cancelar</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className="text-[10px] text-signal">{error}</p> : null}
    {connectionError ? <Link href={`/blog/configuracion?client=${encodeURIComponent(clientSlug)}`} className="inline-block text-xs font-semibold text-moss underline">Revisar conexión</Link> : null}
  </div>;
}

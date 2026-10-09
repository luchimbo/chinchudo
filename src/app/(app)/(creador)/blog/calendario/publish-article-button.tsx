"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { publishCalendarArticle } from "./actions";

export function PublishArticleButton({ id, publishing }: { id: string; publishing: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!publishing && !accepted) return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [publishing, accepted, router]);

  return <div className="space-y-1">
    <button type="button" disabled={pending || publishing || accepted} aria-busy={pending || publishing || accepted}
      className="w-full rounded-lg bg-moss px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-moss/90 disabled:cursor-wait disabled:opacity-60"
      onClick={async () => {
        setPending(true);
        setError("");
        try {
          const result = await publishCalendarArticle(id);
          if (!result.ok) { setError(result.error); return; }
          setAccepted(true);
          router.refresh();
        } catch {
          setError("No se pudo iniciar la publicación. Recargá el calendario y reintentá.");
        } finally {
          setPending(false);
        }
      }}>
      {pending ? "Iniciando…" : publishing || accepted ? "Publicando…" : "Publicar artículo"}
    </button>
    {error ? <p role="alert" className="text-[10px] text-signal">{error}</p> : null}
  </div>;
}

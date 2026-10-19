"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingMessage } from "@/components/loading-ui";
import { deleteBlogArticle } from "./actions";

/** Borrado definitivo: el artículo, sus traducciones y su página pública. */
export function DeleteLandingButton({ id, redirectTo, translations = 0, className }: { id: string; redirectTo?: string; translations?: number; className?: string }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={className || "rounded-lg border border-signal/60 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/10 disabled:cursor-wait disabled:opacity-60"}
        onClick={async () => {
          const extra = translations ? ` También se borrarán sus ${translations} ${translations === 1 ? "traducción" : "traducciones"}.` : "";
          if (!window.confirm(`¿Eliminar este artículo definitivamente?${extra} Si está publicado, se quitará del blog. Los leads se conservan. Esta acción no se puede deshacer.`)) return;
          setPending(true); setError("");
          try {
            const result = await deleteBlogArticle(id);
            if (!result.ok) { setError(result.error); return; }
            if (redirectTo) router.push(redirectTo); else router.refresh();
          } catch { setError("No se pudo eliminar el artículo. Reintentá."); }
          finally { setPending(false); }
        }}
      >
        {pending ? <LoadingMessage>Eliminando…</LoadingMessage> : "Eliminar artículo"}
      </button>
      {error ? <p role="alert" className="text-xs text-signal">{error}</p> : null}
    </div>
  );
}

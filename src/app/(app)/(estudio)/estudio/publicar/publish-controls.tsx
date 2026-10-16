"use client";

import { useState, useTransition } from "react";
import { LoadingSpinner } from "@/components/loading-ui";
import { primaryButton, smallButton } from "@/components/studio/ui";
import { markPublished, setPieceStatus } from "../actions";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }} className={smallButton}>{copied ? "✓ Copiado" : label}</button>;
}

export function PublishControls({ pieceId, status }: { pieceId: string; status: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="space-y-2">
    {status === "READY_TO_RECORD" && <button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await setPieceStatus(pieceId, "RECORDED"); setError(result.error ?? ""); })} className={smallButton}>Ya lo grabé</button>}
    <form onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = await markPublished(pieceId, url); setError(result.error ?? ""); }); }} className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor={`url-${pieceId}`}>Link de la publicación</label>
      <input id={`url-${pieceId}`} value={url} onChange={(event) => setUrl(event.target.value)} type="url" required placeholder="Pegá el link cuando lo publiques" className="h-10 min-w-0 flex-1 rounded-md border border-ink/15 bg-white px-3 text-sm" />
      <button type="submit" disabled={pending} className={`${primaryButton} h-10 text-xs`}>{pending ? <LoadingSpinner /> : "Marcar publicado"}</button>
    </form>
    {error && <p role="alert" className="text-xs text-signal">{error}</p>}
  </div>;
}

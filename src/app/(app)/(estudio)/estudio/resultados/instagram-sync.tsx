"use client";

import { useState, useTransition } from "react";
import { LoadingSpinner } from "@/components/loading-ui";
import { primaryButton } from "@/components/studio/ui";
import { disconnectInstagram, syncInstagramAction, type ActionState } from "../actions";

const STATUS: Record<string, { text: string; tone: string }> = {
  connected: { text: "Instagram conectado. Ya podés traer los números.", tone: "text-moss" },
  denied: { text: "No se autorizó el acceso en Instagram.", tone: "text-signal" },
  not_configured: { text: "Falta configurar la app de Meta (META_APP_ID y META_APP_SECRET). Mientras tanto, cargá los números a mano.", tone: "text-brass" },
  error: { text: "No se pudo conectar Instagram. La cuenta tiene que ser Profesional (Empresa o Creador).", tone: "text-signal" },
};

/** ig-audit: conectar Instagram (solo lectura de métricas propias) y traer los números. */
export function InstagramSync({ clientId, clientSlug, connection, status }: { clientId: string; clientSlug: string; connection: { username: string; lastSyncAt: string | null; lastError: string } | null; status: string | null }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const notice = status ? STATUS[status] : null;
  const run = (task: () => Promise<ActionState>) => startTransition(async () => setResult(await task()));

  return <div className="flex max-w-sm flex-col items-start gap-2 sm:items-end sm:text-right">
    {connection ? <>
      <button type="button" disabled={pending} onClick={() => run(() => syncInstagramAction(clientId))} className={primaryButton}>{pending ? <><LoadingSpinner />Trayendo números…</> : "Actualizar desde Instagram"}</button>
      <p className="text-xs text-slate">Conectado como <span className="font-bold text-ink">@{connection.username || "cuenta"}</span>{connection.lastSyncAt ? ` · última vez ${new Date(connection.lastSyncAt).toLocaleDateString("es-AR")}` : ""} · <button type="button" disabled={pending} onClick={() => run(() => disconnectInstagram(clientId))} className="underline">desconectar</button></p>
      {connection.lastError && !result && <p className="text-xs text-signal">Último error: {connection.lastError}</p>}
    </> : <>
      <a href={`/api/integrations/instagram/connect?client=${encodeURIComponent(clientSlug)}`} className={primaryButton}>Conectar Instagram</a>
      <p className="text-xs text-slate">Solo leemos las métricas de tus publicaciones. No publicamos nada. Sin conexión, podés cargar los números a mano en cada pieza.</p>
    </>}
    {notice && !result && <p role="status" className={`text-xs ${notice.tone}`}>{notice.text}</p>}
    {result?.message && <p role="status" className="text-xs text-moss">{result.message}</p>}
    {result?.error && <p role="alert" className="text-xs text-signal">{result.error}</p>}
  </div>;
}

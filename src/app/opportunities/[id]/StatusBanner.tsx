"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  agentError?: string;
  agentOk?: string;
  agentPending?: string;
  opportunityId: string;
  agentErrorMessages: Record<string, string>;
};

export function StatusBanner({ agentError, agentOk, agentPending, opportunityId, agentErrorMessages }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [resolvedError, setResolvedError] = useState<string | null>(null);
  const [resolvedOk, setResolvedOk] = useState(false);
  const [stillPending, setStillPending] = useState(!!agentPending);

  // Scroll al banner automáticamente cuando aparece
  useEffect(() => {
    if ((agentError || agentOk || agentPending) && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [agentError, agentOk, agentPending]);

  // Polling cuando el agente está pendiente
  useEffect(() => {
    if (!agentPending) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 24; // 2 min a 5s por intento

    const poll = async () => {
      attempts++;
      try {
        const resp = await fetch(`/api/publish-result?opportunityId=${opportunityId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.pending) return; // aún procesando
        if (data.success) {
          setResolvedOk(true);
          setStillPending(false);
        } else {
          setResolvedError(data.error ?? "unknown");
          setStillPending(false);
        }
      } catch {
        // red caída — seguimos intentando
      }
      if (attempts >= MAX_ATTEMPTS) {
        setStillPending(false); // evitar loop infinito
      }
    };

    poll(); // primer intento inmediato
    const id = setInterval(() => {
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(id);
        return;
      }
      poll();
    }, 5_000);

    return () => clearInterval(id);
  }, [agentPending, opportunityId]);

  const showError = agentError || resolvedError;
  const showOk = agentOk || resolvedOk;

  if (!showError && !showOk && !stillPending) return null;

  return (
    <div ref={ref}>
      {showError ? (
        <div role="alert" aria-live="assertive" className="rounded-lg border border-signal/30 bg-signal/10 px-4 py-4 text-sm text-ink">
          <p className="font-bold text-signal mb-1">Error al publicar</p>
          <p>{agentErrorMessages[showError as string] ?? showError}</p>
          <Link href={`/opportunities/${opportunityId}`} className="mt-2 inline-block text-xs underline underline-offset-2 text-signal">
            Reintentar
          </Link>
        </div>
      ) : null}
      {showOk ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-moss/30 bg-moss/10 px-4 py-4 text-sm font-semibold text-moss">
          <p>Publicado correctamente.</p>
          <Link href="/" className="mt-1 inline-block text-xs font-normal underline underline-offset-2">Volver al tablero</Link>
        </div>
      ) : null}
      {stillPending && !showError && !showOk ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-brass/30 bg-brass/10 px-4 py-4 text-sm text-ink">
          <p className="font-bold text-brass mb-1">Publicación en proceso…</p>
          <p className="text-xs leading-5">El agente está trabajando. Esta página se actualiza sola cuando termina.</p>
        </div>
      ) : null}
    </div>
  );
}

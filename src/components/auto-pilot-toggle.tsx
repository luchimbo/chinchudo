"use client";

import { useState, useTransition } from "react";
import { updateClientAutoSettings } from "@/app/(app)/opportunities/actions";
import { LoadingSpinner } from "./loading-ui";

type AutoPilotToggleProps = {
  clientId: string;
  initialAutoApprove: boolean;
  initialAutoPublish: boolean;
};

export function AutoPilotToggle({
  clientId,
  initialAutoApprove,
  initialAutoPublish,
}: AutoPilotToggleProps) {
  const [autoApprove, setAutoApprove] = useState(initialAutoApprove);
  const [autoPublish, setAutoPublish] = useState(initialAutoPublish);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleToggle = (type: "approve" | "publish", nextVal: boolean) => {
    setError("");
    let nextApprove = autoApprove;
    let nextPublish = autoPublish;

    if (type === "approve") {
      nextApprove = nextVal;
      // Si deshabilitamos autoApprove, también se tiene que deshabilitar autoPublish
      if (!nextVal) nextPublish = false;
      setAutoApprove(nextApprove);
      setAutoPublish(nextPublish);
    } else {
      nextPublish = nextVal;
      // Si habilitamos autoPublish, también se tiene que habilitar autoApprove
      if (nextVal) nextApprove = true;
      setAutoApprove(nextApprove);
      setAutoPublish(nextPublish);
    }

    startTransition(async () => {
      try {
        await updateClientAutoSettings(clientId, nextApprove, nextPublish);
      } catch (err) {
        console.error("Error al actualizar piloto automático:", err);
        // Revertir estado local en caso de error
        setAutoApprove(autoApprove);
        setAutoPublish(autoPublish);
        setError("No se pudo actualizar el piloto automático. Intentá de nuevo.");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-lg border border-ink/10 bg-white/40 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate/80">Piloto Automático:</span>
        {isPending ? <span role="status" className="inline-flex items-center gap-2 normal-case tracking-normal"><LoadingSpinner />Guardando…</span> : null}
      </div>

      <div className="flex items-center gap-4">
        {/* Toggle Auto-Aprobar */}
        <label className="relative inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => handleToggle("approve", e.target.checked)}
            className="peer sr-only"
            disabled={isPending}
          />
          <div className="peer h-5 w-9 rounded-full bg-ink/15 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-moss peer-checked:after:translate-x-full" />
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink">Auto-Aprobar</span>
        </label>

        {/* Toggle Auto-Publicar */}
        <label className="relative inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoPublish}
            onChange={(e) => handleToggle("publish", e.target.checked)}
            className="peer sr-only"
            disabled={isPending}
          />
          <div className="peer h-5 w-9 rounded-full bg-ink/15 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-signal peer-checked:after:translate-x-full" />
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink">Auto-Publicar</span>
        </label>
      </div>

      <div className="text-[11px] font-medium text-slate/75">
        {autoPublish ? (
          <span className="text-signal font-semibold">● Envío directo activo (sin revisión)</span>
        ) : autoApprove ? (
          <span className="text-moss font-semibold">● Genera borradores aprobados listos para publicar</span>
        ) : (
          <span>Modo manual: el operador revisa, aprueba y publica</span>
        )}
      </div>
      {error ? <p role="alert" className="w-full text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

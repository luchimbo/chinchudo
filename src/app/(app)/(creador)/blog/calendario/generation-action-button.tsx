"use client";
import { useState } from "react";
import { LoadingMessage } from "@/components/loading-ui";
import { notifyGenerationStarted } from "@/lib/blog-tasks";
import { useRouter } from "next/navigation";
import { requestBlogPreparation } from "./actions";
import { BriefField } from "./brief-field";

export function GenerationActionButton({ id, day, client, label, action, kind }: { id: string; day: string; client: string; label: string; action: (data: FormData) => Promise<void>; kind?: "replace" | "restore" | "retry" }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [brief, setBrief] = useState("");
  const router = useRouter();
  // Solo el reemplazo admite consigna: el resto repite el pedido original.
  const withBrief = kind === "replace";
  return <div className="space-y-2">
    {withBrief ? <details className="text-sm"><summary className="cursor-pointer text-slate">Indicar un tema o consigna (opcional)</summary><div className="mt-2"><BriefField value={brief} onChange={setBrief} /></div></details> : null}
    <button type="button" disabled={pending} aria-busy={pending} className="text-sm font-semibold text-moss underline disabled:cursor-wait disabled:opacity-50" onClick={async () => {
      setPending(true); setError("");
      try {
        if (client === "pcmidi" && kind) { const result = await requestBlogPreparation(kind, id, withBrief ? brief : undefined); if (!result.ok) {setError(result.error);return;} }
        else { const data = new FormData(); data.set("id", id); if (withBrief) data.set("brief", brief); await action(data); }
        if (client === "pcmidi") notifyGenerationStarted({ id, day, client }); else router.refresh();
      }
      catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo solicitar la preparación. Reintentá."); }
      finally { setPending(false); }
    }}>{pending ? <LoadingMessage>Solicitando…</LoadingMessage> : withBrief && brief.trim() ? `${label} con esta consigna` : label}</button>{error ? <p role="alert" className="text-sm text-signal">{error}</p> : null}</div>;
}

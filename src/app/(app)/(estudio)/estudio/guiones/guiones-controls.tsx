"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { LoadingSpinner } from "@/components/loading-ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SideSheet } from "@/components/studio/side-sheet";
import { primaryButton, secondaryButton, withClient } from "@/components/studio/ui";
import { quickScript, writeScriptForPiece, type ActionState } from "../actions";

/** "Escribir guion" para una pieza aprobada; al terminar abre el editor. */
export function WriteScriptButton({ pieceId, clientSlug }: { pieceId: string; clientSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div>
    <button type="button" disabled={pending} onClick={() => startTransition(async () => {
      setError("");
      const result = await writeScriptForPiece(pieceId);
      if (result.error || !result.scriptId) { setError(result.error ?? "No se pudo escribir el guion."); return; }
      router.push(withClient(`/estudio/guiones?script=${result.scriptId}`, clientSlug), { scroll: false });
    })} className={`${primaryButton} h-9 px-4 text-xs`}>{pending ? <><LoadingSpinner />Escribiendo… (≈30 s)</> : "Escribir guion"}</button>
    {error && <p role="alert" className="mt-2 text-xs text-signal">{error}</p>}
  </div>;
}

const FOCUSES = [
  { value: "Mostrar uso", description: "Lleva el producto a una escena real" },
  { value: "Resolver una duda", description: "Aclara una pregunta frecuente" },
  { value: "Vender", description: "Destaca valor y motivo de compra" },
  { value: "Inspirar", description: "Una idea creativa para grabar" },
];

export function QuickScriptButton({ clientId, clientSlug, products }: { clientId: string; clientSlug: string; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<ActionState & { scriptId?: string }, FormData>(quickScript, { error: null });
  useEffect(() => {
    if (state.scriptId) router.push(withClient(`/estudio/guiones?script=${state.scriptId}`, clientSlug), { scroll: false });
  }, [state.scriptId, clientSlug, router]);
  return <>
    <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>Guion rápido desde un producto</button>
    {open && !state.scriptId && <SideSheet title="Guion rápido" onClose={() => setOpen(false)}>
      <p className="text-sm text-slate">Para cuando no hace falta planificar: elegí un producto y un enfoque.</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />
        <label className="grid gap-1.5 text-sm font-bold">Producto<select name="productId" required className="h-11 rounded-md border border-ink/15 bg-white px-3 text-sm font-normal">{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <fieldset><legend className="text-sm font-bold">Enfoque</legend>
          <div className="mt-2 grid gap-2">{FOCUSES.map((focus, index) => <label key={focus.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink/10 bg-white p-3 has-[:checked]:border-brass has-[:checked]:bg-brass/10">
            <input type="radio" name="focus" value={focus.value} defaultChecked={index === 0} className="mt-1 accent-ink" />
            <span><span className="block text-sm font-black">{focus.value}</span><span className="block text-xs text-slate">{focus.description}</span></span>
          </label>)}</div>
        </fieldset>
        <PendingSubmitButton className={`${primaryButton} w-full`} loadingText="Escribiendo guion… (≈30 s)">Escribir guion</PendingSubmitButton>
        {state.error && <p role="alert" className="text-sm text-signal">{state.error}</p>}
      </form>
    </SideSheet>}
  </>;
}

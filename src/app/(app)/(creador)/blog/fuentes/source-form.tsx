"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEditorialSource } from "./actions";

const input = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink";
export function SourceForm({ clientId, products }: { clientId: string; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return <form className="grid gap-4" onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; setBusy(true);
    try { const value = await addEditorialSource(new FormData(form)); setResult(value); if (value.ok) { form.reset(); router.refresh(); } }
    catch { setResult({ ok: false, message: "No se pudo guardar. Probá nuevamente." }); }
    finally { setBusy(false); }
  }}>
    <input type="hidden" name="clientId" value={clientId} />
    <label className="grid gap-1 text-xs font-semibold text-slate">Título de la fuente<input name="title" required maxLength={200} className={input} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate">Tipo<select name="type" className={input}><option value="manufacturer">Documentación del fabricante</option><option value="independent">Fuente independiente</option><option value="case_study">Caso real o testimonio documentado</option><option value="internal">Documentación interna</option></select></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-slate">Enlace público<input name="url" type="url" className={input} placeholder="https://…" /></label><label className="grid gap-1 text-xs font-semibold text-slate">Referencia interna<input name="reference" maxLength={500} className={input} placeholder="Documento, ficha o registro identificable" /></label></div>
    <label className="grid gap-1 text-xs font-semibold text-slate">Afirmaciones comprobadas, una por línea<textarea name="claims" required rows={5} maxLength={12000} className={input} placeholder="Copiá frases completas respaldadas por esta fuente." /><span className="font-normal">Las afirmaciones sensibles se citarán con el texto revisado. Un enlace por sí solo no respalda cualquier afirmación.</span></label>
    <label className="grid gap-1 text-xs font-semibold text-slate">Productos que respalda<select name="productIds" multiple size={5} className={input}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="font-normal">Seleccioná los modelos cubiertos por la documentación para habilitar comparativas.</span></label>
    <label className="flex items-start gap-2 text-sm text-ink"><input name="verified" type="checkbox" required className="mt-1" /><span>Revisé la fuente y las afirmaciones. Si es un caso o testimonio, confirmé que es real y puede publicarse.</span></label>
    {result ? <p role="status" className={`text-sm ${result.ok ? "text-moss" : "text-rose-700"}`}>{result.message}</p> : null}
    <button disabled={busy} className="w-fit rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-50">{busy ? "Guardando…" : "Guardar fuente revisada"}</button>
  </form>;
}

"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const MAX_SIZE = 5 * 1024 * 1024;

export function IssueReportButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const originPath = searchParams.size ? `${pathname}?${searchParams.toString()}` : pathname;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setDescription(""); setImageUrl(""); setPreviewUrl(""); setError(""); setSuccess(false);
  }

  function close() { setOpen(false); reset(); }

  async function upload(file: File) {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) { setError("Usá una imagen PNG, JPG o WEBP."); return; }
    if (file.size > MAX_SIZE) { setError("La imagen supera el límite de 5 MB."); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file)); setError(""); setUploading(true);
    const form = new FormData(); form.append("file", file);
    try {
      const response = await fetch("/api/issue-reports/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo subir la imagen.");
      setImageUrl(data.url);
    } catch (reason) { setPreviewUrl(""); setError(reason instanceof Error ? reason.message : "No se pudo subir la imagen."); }
    finally { setUploading(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!description.trim()) { setError("Contá qué problema encontraste."); return; }
    if (uploading) { setError("Esperá a que termine la carga de la imagen."); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/issue-reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, originPath, imageUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el reporte.");
      setSuccess(true); setDescription(""); setImageUrl("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el reporte."); }
    finally { setSubmitting(false); }
  }

  return <>
    <button type="button" onClick={() => { reset(); setOpen(true); }} className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-signal px-4 py-3 text-sm font-bold text-white shadow-panel transition hover:-translate-y-0.5 hover:bg-[#bd3d24]" aria-haspopup="dialog">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/70 text-base leading-none">!</span>
      Reportar problema
    </button>
    {open ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="issue-report-title">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-panel">
        <div className="flex items-start justify-between border-b border-ink/10 px-6 py-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-signal">Bitácora de desarrollo</p><h2 id="issue-report-title" className="mt-1 font-display text-3xl text-ink">Reportar un problema</h2></div>
          <button type="button" onClick={close} className="rounded-full px-2 py-1 text-slate transition hover:bg-ink/5" aria-label="Cerrar">×</button>
        </div>
        {success ? <div className="px-6 py-10 text-center"><p className="font-display text-2xl text-moss">Reporte guardado</p><p className="mt-2 text-sm text-slate">Ya quedó registrado para el equipo de desarrollo.</p><div className="mt-6 flex justify-center gap-3"><Link href="/reportes" onClick={close} className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper">Ver reportes</Link><button type="button" onClick={close} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink">Cerrar</button></div></div> :
          <form onSubmit={submit} className="grid gap-5 px-6 py-5">
            <div className="rounded-lg border border-brass/25 bg-brass/10 px-3 py-2 text-xs text-slate">Pantalla reportada: <strong className="text-ink">{originPath}</strong></div>
            <label className="grid gap-2 text-sm font-bold text-ink">¿Qué está pasando?<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={5} autoFocus placeholder="Contá qué esperabas que ocurra y qué sucedió en cambio." className="resize-y rounded-lg border border-ink/20 bg-white/60 px-3 py-2 text-sm font-normal text-ink placeholder:text-slate/55" /></label>
            <div className="grid gap-2"><span className="text-sm font-bold text-ink">Imagen de referencia <em className="font-normal text-slate">(opcional)</em></span>{previewUrl ? <div className="relative overflow-hidden rounded-lg border border-ink/15 bg-white/50">{/* La previsualización usa una URL blob local, incompatible con next/image. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={previewUrl} alt="Vista previa de evidencia" className="max-h-52 w-full object-contain" /><button type="button" onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setImageUrl(""); if (inputRef.current) inputRef.current.value = ""; }} className="absolute right-2 top-2 rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink shadow">Quitar</button></div> : <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-ink/25 bg-white/35 text-sm text-slate transition hover:border-brass hover:bg-brass/5">{uploading ? "Subiendo evidencia…" : "Elegir imagen (PNG, JPG o WEBP · hasta 5 MB)"}</button>}<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
            {error ? <p className="rounded-lg bg-signal/10 px-3 py-2 text-sm text-signal">{error}</p> : null}
            <div className="flex justify-end gap-3"><button type="button" onClick={close} className="rounded-full px-4 py-2 text-sm font-bold text-slate">Cancelar</button><button type="submit" disabled={submitting || uploading} className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate disabled:opacity-50">{submitting ? "Guardando…" : "Guardar reporte"}</button></div>
          </form>}
      </div>
    </div> : null}
  </>;
}

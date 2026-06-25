"use client";

import { useRef, useState } from "react";
import Image from "next/image";

export function LogoUpload({
  clientSlug,
  currentUrl,
  onUploaded,
}: {
  clientSlug: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(currentUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    // Preview local inmediato
    setPreview(URL.createObjectURL(file));

    const form = new FormData();
    form.append("file", file);
    form.append("clientSlug", clientSlug);

    const res = await fetch("/api/upload/logo", { method: "POST", body: form });
    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al subir el archivo.");
      setPreview(currentUrl);
      return;
    }

    onUploaded(data.url);
  }

  return (
    <div className="grid gap-3">
      {/* Preview */}
      <div
        className="flex h-24 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-ink/15 bg-paper/60 transition hover:border-ink/30"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <Image
            src={preview}
            alt="Logo"
            width={320}
            height={96}
            className="max-h-20 w-auto object-contain"
            unoptimized
          />
        ) : (
          <span className="text-xs text-slate/50">Sin logo — hacé clic para subir</span>
        )}
      </div>

      {/* Botón */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50"
        >
          {loading ? "Subiendo…" : preview ? "Cambiar logo" : "Subir logo"}
        </button>
        <span className="text-[11px] text-slate/50">PNG o SVG · fondo transparente · 400 × 120 px</span>
      </div>

      {error ? <p className="text-[11px] text-red-500">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

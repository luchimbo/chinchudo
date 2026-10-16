"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/loading-ui";
import { primaryButton, smallButton } from "@/components/studio/ui";
import { generateCarouselAction, generateStoriesAction, markPublished, morePiecesAction, setPieceStatus } from "../actions";

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

type Extras = { carousel?: { cover: string; slides: { title: string; body: string }[]; lastSlide: string }; stories?: { text: string; sticker: string; goal: string }[] };

function ActionButton({ label, pendingLabel, action, primary = false }: { label: string; pendingLabel: string; action: () => Promise<{ error: string | null; message?: string }>; primary?: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<{ error: string | null; message?: string } | null>(null);
  return <span className="inline-flex flex-col gap-1">
    <button type="button" disabled={pending} onClick={() => startTransition(async () => { const next = await action(); setResult(next); if (!next.error) router.refresh(); })} className={primary ? `${primaryButton} h-9 px-4 text-xs` : smallButton}>{pending ? <><LoadingSpinner />{pendingLabel}</> : label}</button>
    {result?.error && <span role="alert" className="text-xs text-signal">{result.error}</span>}
    {result?.message && !result.error && <span role="status" className="text-xs text-moss">{result.message}</span>}
  </span>;
}

/** ig-carousel, ig-story e ig-repurpose sobre una pieza lista. */
export function FormatTools({ pieceId, pieceType, extras }: { pieceId: string; pieceType: string; extras: Extras }) {
  const carouselText = extras.carousel ? [`Portada: ${extras.carousel.cover}`, ...extras.carousel.slides.map((slide, index) => `${index + 2}. ${slide.title ? `${slide.title}: ` : ""}${slide.body}`), `Última: ${extras.carousel.lastSlide}`].join("\n") : "";
  const storiesText = extras.stories ? extras.stories.map((story, index) => `${index + 1}. ${story.text} [${story.sticker}] (${story.goal})`).join("\n") : "";
  return <div className="space-y-3 rounded-xl border border-ink/10 bg-paper/50 p-3">
    <p className="text-xs font-black uppercase tracking-wider text-brass">Otros formatos con el mismo contenido</p>
    <div className="flex flex-wrap gap-2">
      <ActionButton primary={pieceType === "CAROUSEL"} label={extras.carousel ? "Rehacer carrusel" : "Convertir en carrusel"} pendingLabel="Armando… (≈20 s)" action={() => generateCarouselAction(pieceId)} />
      <ActionButton primary={pieceType === "STORY"} label={extras.stories ? "Rehacer historias" : "Secuencia de historias"} pendingLabel="Armando… (≈20 s)" action={() => generateStoriesAction(pieceId)} />
      <ActionButton label="Sacar más piezas" pendingLabel="Pensando… (≈20 s)" action={() => morePiecesAction(pieceId)} />
    </div>
    {extras.carousel && <details className="rounded-lg bg-white p-3 text-sm" open={pieceType === "CAROUSEL"}>
      <summary className="cursor-pointer font-bold">Carrusel · {extras.carousel.slides.length + 2} diapositivas (1080×1350)</summary>
      <ol className="mt-2 space-y-1.5">
        <li><span className="font-black">Portada:</span> {extras.carousel.cover}</li>
        {extras.carousel.slides.map((slide, index) => <li key={index}><span className="font-black">{index + 2}.</span> {slide.title && <span className="font-bold">{slide.title}: </span>}{slide.body}</li>)}
        <li><span className="font-black">Última:</span> {extras.carousel.lastSlide}</li>
      </ol>
      <div className="mt-2"><CopyButton text={carouselText} label="Copiar carrusel" /></div>
    </details>}
    {extras.stories && <details className="rounded-lg bg-white p-3 text-sm" open={pieceType === "STORY"}>
      <summary className="cursor-pointer font-bold">Historias · {extras.stories.length}</summary>
      <ol className="mt-2 space-y-1.5">{extras.stories.map((story, index) => <li key={index}><span className="font-black">{index + 1}.</span> {story.text} <span className="text-xs text-slate">· Sticker: {story.sticker} · Para: {story.goal}</span></li>)}</ol>
      <div className="mt-2"><CopyButton text={storiesText} label="Copiar historias" /></div>
    </details>}
  </div>;
}

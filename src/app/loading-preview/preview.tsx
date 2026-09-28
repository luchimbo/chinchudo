"use client";

import { useEffect, useState } from "react";
import { LoadingMessage, PageSkeleton } from "@/components/loading-ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type SkeletonKind = "dashboard" | "list" | "form" | "auth";
type DemoState = "idle" | "pending" | "success" | "error";
type DemoAction = { label: string; pendingText: string; duration: number; fail?: boolean };

const skeletons: { kind: SkeletonKind; label: string; context: string }[] = [
  { kind: "dashboard", label: "Panel", context: "Inicio y métricas" },
  { kind: "list", label: "Listado", context: "Oportunidades e historial" },
  { kind: "form", label: "Formulario", context: "Configuración y edición" },
  { kind: "auth", label: "Acceso", context: "Login y registro" },
];

const actions: DemoAction[] = [
  { label: "Respuesta rápida", pendingText: "Generando respuesta…", duration: 80 },
  { label: "Generar respuesta", pendingText: "Generando respuesta…", duration: 2400 },
  { label: "Buscar oportunidades", pendingText: "Buscando oportunidades…", duration: 2000 },
  { label: "Subir archivo", pendingText: "Subiendo archivo…", duration: 2000 },
  { label: "Publicar", pendingText: "Publicando…", duration: 2000 },
  { label: "Simular error", pendingText: "Generando respuesta…", duration: 2000, fail: true },
];

export default function LoadingPreview({ action }: { action: () => Promise<void> }) {
  const [selected, setSelected] = useState<SkeletonKind>("dashboard");
  const [demo, setDemo] = useState<DemoState>("idle");
  const [demoAction, setDemoAction] = useState<DemoAction | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (progress === null || progress >= 5) return;
    const timer = setTimeout(() => setProgress((value) => value === null ? null : value + 1), 950);
    return () => clearTimeout(timer);
  }, [progress]);

  useEffect(() => {
    if (demo !== "pending" || !demoAction) return;
    const reveal = setTimeout(() => setShowPending(true), 160);
    const finish = setTimeout(() => setDemo(demoAction.fail ? "error" : "success"), demoAction.duration);
    return () => { clearTimeout(reveal); clearTimeout(finish); };
  }, [demo, demoAction]);

  function runDemo(nextAction: DemoAction) {
    setDemoAction(nextAction);
    setShowPending(false);
    setDemo("pending");
  }

  const selectedItem = skeletons.find((item) => item.kind === selected)!;

  return <main className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
    <header className="mb-10 max-w-3xl">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-moss">Laboratorio local · UI de carga</p>
      <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">Probá los estados de espera</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">Una vista de desarrollo para recorrer las cargas de la suite. Los ejemplos de abajo son simulaciones: no guardan, generan ni publican datos.</p>
    </header>

    <section aria-labelledby="skeleton-title" className="mb-8 rounded-2xl border border-ink/10 bg-white/70 p-5 shadow-panel sm:p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-moss">01 / Navegación</p><h2 id="skeleton-title" className="mt-2 font-display text-2xl">Esqueletos de página</h2></div>
        <p className="text-sm text-ink/60">Elegí una estructura</p>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4" role="group" aria-label="Tipo de pantalla">
        {skeletons.map((item) => <button key={item.kind} type="button" aria-pressed={selected === item.kind} onClick={() => setSelected(item.kind)} className={`rounded-xl border p-3 text-left transition-colors duration-200 ${selected === item.kind ? "border-ink bg-ink text-white" : "border-ink/15 bg-paper/50 text-ink hover:border-ink/40"}`}>
          <span className="block text-sm font-semibold">{item.label}</span><span className={`mt-1 block text-xs ${selected === item.kind ? "text-white/70" : "text-ink/55"}`}>{item.context}</span>
        </button>)}
      </div>
      <div className="overflow-hidden rounded-xl border border-ink/10 bg-paper/70">
        <div className="flex items-center justify-between border-b border-ink/10 bg-white/70 px-4 py-2 text-xs text-ink/60"><span>Vista previa · {selectedItem.label}</span><span>Animación real</span></div>
        <div className={selected === "auth" ? "min-h-[420px]" : "min-h-[470px]"} key={selected}><PageSkeleton kind={selected} /></div>
      </div>
    </section>

    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="actions-title" className="rounded-2xl border border-ink/10 bg-white/70 p-5 shadow-panel sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-moss">02 / Acciones</p>
        <h2 id="actions-title" className="mt-2 font-display text-2xl">Botones pendientes</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">Este formulario usa el mismo botón de envío que las pantallas reales. La espera dura 2,2 segundos.</p>
        <form action={action} className="mt-6 flex flex-wrap items-center gap-3">
          <PendingSubmitButton className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white" loadingText="Guardando…">Guardar prueba</PendingSubmitButton>
          <span className="text-xs text-ink/55">Podés comprobar que el doble envío queda bloqueado.</span>
        </form>
        <div className="my-6 border-t border-ink/10" />
        <p className="text-sm font-semibold">Respuesta rápida, lenta y fallida</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((item) => <button key={item.label} type="button" disabled={demo === "pending"} onClick={() => runDemo(item)} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium hover:bg-paper disabled:opacity-60">{item.label}</button>)}
        </div>
        <div className="mt-4 min-h-7 text-sm" aria-live="polite">
          {demo === "pending" && showPending ? <LoadingMessage>{demoAction?.pendingText}</LoadingMessage> : null}
          {demo === "success" ? <span className="text-moss">Acción simulada completada. Ya podés volver a intentarlo.</span> : null}
          {demo === "error" ? <span role="alert" className="text-red-700">No se pudo completar la acción. Podés reintentar.</span> : null}
        </div>
      </section>

      <section aria-labelledby="progress-title" className="rounded-2xl border border-ink/10 bg-white/70 p-5 shadow-panel sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-moss">03 / Procesos largos</p>
        <h2 id="progress-title" className="mt-2 font-display text-2xl">Progreso por etapas</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">Ejemplo local de búsqueda de oportunidades. Aquí las etapas son simuladas y están identificadas como tales.</p>
        <button type="button" disabled={progress !== null && progress < 5} onClick={() => setProgress(0)} className="mt-6 rounded-full bg-moss px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{progress !== null && progress < 5 ? "Buscando…" : "Iniciar simulación"}</button>
        <div className="mt-5 min-h-28 rounded-xl border border-ink/10 bg-paper/60 p-4" aria-live="polite">
          {progress === null ? <p className="text-sm text-ink/60">La simulación está lista.</p> : <>
            <div className="flex items-center justify-between gap-4 text-sm"><strong>{progress === 5 ? "Búsqueda completada" : "Buscando oportunidades…"}</strong><span>{progress} de 5 etapas</span></div>
            <div role="progressbar" aria-label="Progreso de la simulación" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={5} className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-moss transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress * 20}%` }} /></div>
            <p className="mt-3 text-xs text-ink/60">Simulación local · no se ejecutó una búsqueda real.</p>
          </>}
        </div>
      </section>
    </div>
    <p className="mt-8 text-xs text-ink/50">Disponible únicamente en localhost durante desarrollo.</p>
  </main>;
}

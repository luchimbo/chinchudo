"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.32em] text-signal">Algo salió mal</p>
      <h1 className="mt-4 font-display text-5xl text-ink md:text-6xl">Error inesperado</h1>
      <p className="mt-4 max-w-md text-base leading-7 text-slate">
        Ocurrió un problema al cargar esta página. Probá de nuevo; si persiste, revisá los logs del servidor.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          onClick={reset}
          className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-bold text-paper shadow-lg transition hover:-translate-y-0.5 hover:bg-slate"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-ink/15 px-6 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
        >
          Volver al tablero
        </Link>
      </div>
    </main>
  );
}

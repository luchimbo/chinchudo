import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.32em] text-moss">Error 404</p>
      <h1 className="mt-4 font-display text-5xl text-ink md:text-6xl">No se encontró</h1>
      <p className="mt-4 max-w-md text-base leading-7 text-slate">
        La oportunidad que buscás no existe o fue eliminada. Puede haber sido descartada o filtrada.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-bold text-paper shadow-lg transition hover:-translate-y-0.5 hover:bg-slate"
      >
        Volver al tablero
      </Link>
    </main>
  );
}

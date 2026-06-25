export default function AppLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 lg:px-8 animate-pulse">
      {/* Simulación de Header de Página */}
      <header className="mb-8">
        <div className="h-4 w-32 rounded bg-ink/5 mb-3" />
        <div className="h-10 w-64 rounded bg-ink/10 mb-4" />
        <div className="h-4 w-96 max-w-full rounded bg-ink/5" />
      </header>

      {/* Simulación de KPI Cards */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-lg border border-ink/5 bg-white/40 p-5 flex flex-col justify-between"
          >
            <div className="h-3 w-20 rounded bg-ink/5" />
            <div className="h-8 w-16 rounded bg-ink/10" />
            <div className="h-3 w-24 rounded bg-ink/5" />
          </div>
        ))}
      </section>

      {/* Simulación de Panel Principal / Grilla */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-ink/5 bg-white/40 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-ink/5 pb-4">
            <div className="h-4 w-28 rounded bg-ink/10" />
            <div className="h-6 w-20 rounded bg-ink/5" />
          </div>
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-ink/5 pb-3 last:border-0 last:pb-0">
                <div className="flex justify-between">
                  <div className="h-4 w-1/3 rounded bg-ink/10" />
                  <div className="h-3 w-12 rounded bg-ink/5" />
                </div>
                <div className="h-3 w-full rounded bg-ink/5" />
                <div className="h-3 w-2/3 rounded bg-ink/5" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/5 bg-white/40 p-6 flex flex-col gap-4">
          <div className="h-4 w-24 rounded bg-ink/10 mb-2" />
          <div className="h-32 rounded bg-ink/5" />
          <div className="h-4 w-full rounded bg-ink/5" />
          <div className="h-4 w-5/6 rounded bg-ink/5" />
          <div className="h-10 w-full rounded-full bg-ink/10 mt-auto" />
        </div>
      </section>
    </div>
  );
}

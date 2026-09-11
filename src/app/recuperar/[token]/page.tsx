type Props = { params: { token: string }; searchParams: { error?: string } };

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Completá los dos campos.",
  match: "Las contraseñas no coinciden.",
  policy: "La contraseña no cumple los requisitos mínimos (10 caracteres, no una común).",
  invalid: "El link no es válido o ya venció. Pedí uno nuevo.",
  ratelimit: "Demasiados intentos. Esperá unos minutos.",
};

export default async function ResetTokenPage({ params, searchParams }: Props) {
  const error = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? "No se pudo restablecer la contraseña." : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink">Nueva contraseña</h1>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          {error && (
            <div className="mb-4 rounded-lg border border-signal/20 bg-signal/10 px-4 py-3 text-sm font-medium text-signal">
              {error}
            </div>
          )}
          <form action="/api/auth/reset-confirm" method="POST" className="space-y-4">
            <input type="hidden" name="token" value={params.token} />
            <label htmlFor="password" className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">Nueva contraseña</span>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-ink/35"
              />
            </label>
            <label htmlFor="confirmPassword" className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">Confirmar</span>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-ink/35"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ink/90"
            >
              Restablecer
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

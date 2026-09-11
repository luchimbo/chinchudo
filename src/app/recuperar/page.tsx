type Props = { searchParams: { sent?: string } };

export default async function RecuperarPage({ searchParams }: Props) {
  const sent = searchParams.sent === "1";

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink">Recuperar acceso</h1>
          <p className="mt-2 text-sm text-slate">Te mandamos un link para restablecer tu contraseña.</p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          {sent ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              Si el email está registrado, vas a recibir un correo con instrucciones.
            </p>
          ) : (
            <form action="/api/auth/reset-request" method="POST" className="space-y-4">
              <label htmlFor="email" className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">Email</span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-ink/35"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ink/90"
              >
                Enviar instrucciones
              </button>
            </form>
          )}
          <p className="mt-6 text-center text-xs text-slate">
            <a href="/login" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4">
              Volver a ingresar
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

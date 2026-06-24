import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Props = { searchParams: { from?: string; error?: string } };

export default async function LoginPage({ searchParams }: Props) {
  // Si ya tiene sesión válida, redirigir
  const store  = await cookies();
  const session = store.get("auth_session")?.value;
  if (session && session === process.env.AUTH_SECRET) {
    redirect(searchParams.from ?? "/");
  }

  const from  = searchParams.from ?? "/";
  const error = searchParams.error;
  const hasUsers = Boolean(process.env.AUTH_USERS_JSON);

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="grain" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mt-3 font-display text-4xl text-ink">Ingresar</h1>
          <p className="mt-2 text-sm text-slate/60">Sistema interno · Acceso restringido</p>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white/80 p-8 shadow-panel backdrop-blur">
          {error && (
            <div className="mb-4 rounded-md bg-signal/10 px-4 py-3 text-sm text-signal">
              Contraseña incorrecta. Intentá de nuevo.
            </div>
          )}

          <form action="/api/auth/login" method="POST">
            <input type="hidden" name="from" value={from} />

            {hasUsers ? (
              <label htmlFor="username" className="mb-4 block">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
                  Usuario
                </span>
                <input
                  id="username"
                  type="text"
                  name="username"
                  required
                  autoFocus
                  autoComplete="username"
                  className="mt-2 w-full rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-ink placeholder:text-slate/30 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
                  placeholder="tu usuario"
                />
              </label>
            ) : null}

            <label htmlFor="password" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
                Contraseña
              </span>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoFocus={!hasUsers}
                autoComplete="current-password"
                className="mt-2 w-full rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-ink placeholder:text-slate/30 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              className="mt-5 w-full rounded-full bg-ink py-3 text-sm font-bold text-paper shadow transition hover:-translate-y-0.5 hover:bg-slate"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyJwt } from "@/lib/auth-crypto";

type Props = { searchParams: { from?: string; error?: string } };

export default async function LoginPage({ searchParams }: Props) {
  const requestedFrom = searchParams.from ?? "/";
  const from = requestedFrom.startsWith("/") && !requestedFrom.startsWith("//") ? requestedFrom : "/";
  // Si ya tiene sesion valida, redirigir.
  const store = await cookies();
  const session = store.get("auth_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (session && secret && verifyJwt(session, secret)) {
    redirect(from);
  }

  const error = searchParams.error;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="grain" />
      <div className="z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink">Ingresar</h1>
          <p className="mt-2 text-sm text-slate">Sistema interno &middot; Acceso restringido</p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          {error && (
            <div className="mb-4 rounded-lg border border-signal/20 bg-signal/10 px-4 py-3 text-sm font-medium text-signal">
              {error === "wrong"
                ? "Usuario o contrase\u00f1a incorrecta. Intent\u00e1 de nuevo."
                : error === "config"
                ? "Error de configuraci\u00f3n de seguridad."
                : "Error en el servidor. Intent\u00e1 m\u00e1s tarde."}
            </div>
          )}

          <form action="/api/auth/login" method="POST" className="space-y-4">
            <input type="hidden" name="from" value={from} />

            <label htmlFor="username" className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">
                Usuario / Email
              </span>
              <input
                id="username"
                type="text"
                name="username"
                required
                autoFocus
                autoComplete="email"
                className="w-full rounded-xl border border-ink/15 bg-paper/35 px-4 py-2.5 text-sm text-ink placeholder:text-slate/55 transition-all focus:border-ink focus:bg-white focus:outline-none focus:ring-4 focus:ring-ink/10"
                placeholder="tu@email.com"
              />
            </label>

            <label htmlFor="password" className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">
                Contrase&ntilde;a
              </span>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-ink/15 bg-paper/35 px-4 py-2.5 text-sm text-ink placeholder:text-slate/55 transition-all focus:border-ink focus:bg-white focus:outline-none focus:ring-4 focus:ring-ink/10"
                placeholder="********"
              />
            </label>

            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-ink py-3 text-sm font-semibold text-paper shadow-lg shadow-ink/15 transition-all duration-150 hover:-translate-y-0.5 hover:bg-slate focus:outline-none focus:ring-4 focus:ring-ink/20 active:bg-ink"
            >
              Entrar
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate/70">
            &iquest;Nuevo aqu&iacute;?{" "}
            <Link href="/registro" className="font-semibold text-ink hover:underline">
              Crear espacio (Onboarding)
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

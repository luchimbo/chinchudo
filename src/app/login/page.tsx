import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

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

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 bg-slate-50">
      <div className="grain" />
      <div className="w-full max-w-sm z-10">
        <div className="mb-8 text-center">
          <h1 className="mt-3 font-display text-4xl text-slate-900 tracking-tight font-extrabold">Ingresar</h1>
          <p className="mt-2 text-sm text-slate-500">Sistema interno · Acceso restringido</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-150 px-4 py-3 text-sm text-red-650 font-medium">
              {error === "wrong"
                ? "Usuario o contraseña incorrecta. Intentá de nuevo."
                : error === "config"
                ? "Error de configuración de seguridad."
                : "Error en el servidor. Intentá más tarde."}
            </div>
          )}

          <form action="/api/auth/login" method="POST" className="space-y-4">
            <input type="hidden" name="from" value={from} />

            <label htmlFor="username" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 block mb-1.5">
                Usuario / Email
              </span>
              <input
                id="username"
                type="text"
                name="username"
                required
                autoFocus
                autoComplete="email"
                className="w-full rounded-xl border border-slate-250 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-800/5 transition-all"
                placeholder="tu@email.com"
              />
            </label>

            <label htmlFor="password" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 block mb-1.5">
                Contraseña
              </span>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-250 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-800/5 transition-all"
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-500/20 active:bg-slate-900 transition-all duration-150 hover:-translate-y-0.5"
            >
              Entrar
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-400">
            ¿Nuevo aquí?{" "}
            <Link href="/registro" className="text-slate-600 font-semibold hover:underline">
              Crear espacio (Onboarding)
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

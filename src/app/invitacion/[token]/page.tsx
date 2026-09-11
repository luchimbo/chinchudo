import { prisma } from "@/lib/db";
import { hashAccountToken } from "@/lib/account-tokens";

type Props = { params: { token: string }; searchParams: { error?: string } };

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Completá todos los campos.",
  match: "Las contraseñas no coinciden.",
  policy: "La contraseña no cumple los requisitos mínimos (10 caracteres, no una común).",
  invalid: "La invitación no es válida o ya venció.",
  taken: "Ese email ya tiene una cuenta.",
  ratelimit: "Demasiados intentos. Esperá unos minutos.",
  config: "Error de configuración del servidor.",
};

export default async function InvitacionPage({ params, searchParams }: Props) {
  const error = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? "No se pudo completar el registro." : null;

  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash: hashAccountToken(params.token) },
    include: { client: { select: { name: true } } },
  });
  const expired = !invitation || invitation.acceptedAt || invitation.expiresAt < new Date();

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink">
            {expired ? "Invitación no disponible" : `Unite a ${invitation.client.name}`}
          </h1>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          {error && (
            <div className="mb-4 rounded-lg border border-signal/20 bg-signal/10 px-4 py-3 text-sm font-medium text-signal">
              {error}
            </div>
          )}
          {expired ? (
            <p className="text-sm text-slate">El link venció o ya fue usado. Pedile a un admin que te invite de nuevo.</p>
          ) : (
            <form action="/api/auth/accept-invite" method="POST" className="space-y-4">
              <input type="hidden" name="token" value={params.token} />
              <label htmlFor="name" className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">Nombre</span>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-ink/35"
                />
              </label>
              <label htmlFor="password" className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-slate">Contraseña</span>
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
                Crear cuenta
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

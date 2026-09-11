import { prisma } from "@/lib/db";
import { hashAccountToken } from "@/lib/account-tokens";

type Props = { searchParams: { token?: string } };

async function verify(token: string | undefined): Promise<{ ok: boolean; message: string }> {
  if (!token) return { ok: false, message: "Falta el token de verificación." };
  const tokenHash = hashAccountToken(token);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, message: "El link no es válido o ya venció." };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  return { ok: true, message: "Email verificado correctamente." };
}

export default async function VerificarEmailPage({ searchParams }: Props) {
  const result = await verify(searchParams.token);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="z-10 w-full max-w-sm text-center">
        <div className="rounded-2xl border border-ink/10 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          <p
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-signal/20 bg-signal/10 text-signal"
            }`}
          >
            {result.message}
          </p>
          <a
            href="/"
            className="mt-6 inline-block text-xs font-semibold text-ink underline decoration-ink/25 underline-offset-4"
          >
            Ir al panel
          </a>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

type Card = { href: string; title: string; desc: string };

const CARDS: Card[] = [
  {
    href: "/logins",
    title: "Cuentas",
    desc: "Estado de conexión y perfiles de tus redes sociales (Facebook, X, Reddit, etc.).",
  },
  {
    href: "/monitoring",
    title: "Fuentes de Escucha",
    desc: "Configurar fuentes de monitoreo y canales para recolectar nuevas oportunidades de venta.",
  },
];

export default async function RedesConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: slug } = await searchParams;
  if (!slug) notFound();

  const c = await prisma.client.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!c) notFound();
  try {
    await assertClientAccess(prisma, c.id);
  } catch {
    notFound();
  }

  const q = `?client=${slug}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-ink">Configuración de Redes</h1>
        <p className="mt-1 text-sm text-slate">
          Administrá tus cuentas de publicación y fuentes de monitoreo de escucha social.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={`${card.href}${q}`}
            className="group flex flex-col gap-2 rounded-xl border border-ink/10 bg-paper p-5 transition hover:border-ink/25 hover:shadow-sm"
          >
            <h2 className="font-semibold text-ink">{card.title}</h2>
            <p className="text-xs text-slate/70">{card.desc}</p>
            <span className="mt-2 text-xs font-semibold text-slate/40 transition group-hover:text-ink">
              Configurar →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

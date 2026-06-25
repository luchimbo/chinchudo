import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

type Card = { href: string; title: string; desc: string };
type Group = { title: string; cards: Card[] };

const GROUPS: Group[] = [
  {
    title: "Negocio",
    cards: [
      { href: "/configuracion/identidad", title: "Identidad e IA", desc: "Nombre, descripción, temas del negocio y modelo de IA." },
      { href: "/brands", title: "Marcas", desc: "Posicionamiento, tono y claims permitidos/prohibidos." },
      { href: "/products", title: "Productos", desc: "Catálogo: specs, garantía, stock y precio." },
    ],
  },
  {
    title: "Voces y mensajes",
    cards: [
      { href: "/personas", title: "Personas (voces)", desc: "Rol, tono, objetivos y ejemplos del quinteto." },
      { href: "/prompts", title: "Prompts", desc: "Instrucciones que se le inyectan a la IA." },
      { href: "/knowledge", title: "Conocimiento", desc: "FAQs y objeciones que alimentan las respuestas." },
    ],
  },
];

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: slug } = await searchParams;
  if (!slug) notFound();

  const c = await prisma.client.findUnique({ where: { slug }, select: { id: true } });
  if (!c) notFound();
  try { await assertClientAccess(prisma, c.id); } catch { notFound(); }

  const q = `?client=${slug}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-ink">Configuración</h1>
        <p className="mt-1 text-sm text-slate">Todo lo que define cómo funciona el sistema para este cliente.</p>
      </header>

      <div className="flex flex-col gap-8">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate/45">{group.title}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => (
                <Link
                  key={card.href}
                  href={`${card.href}${q}`}
                  className="group flex flex-col gap-2 rounded-xl border border-ink/10 bg-paper p-5 transition hover:border-ink/25 hover:shadow-sm"
                >
                  <h2 className="font-semibold text-ink">{card.title}</h2>
                  <p className="text-xs text-slate/70">{card.desc}</p>
                  <span className="mt-1 text-xs font-semibold text-slate/40 transition group-hover:text-ink">Configurar →</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

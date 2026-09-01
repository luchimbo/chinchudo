import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { changeOwnPassword } from "./actions";

type Card = { href: string; title: string; desc: string };
type Group = { title: string; cards: Card[] };

const GROUPS: Group[] = [
  {
    title: "Negocio",
    cards: [
      { href: "/onboarding", title: "Revisar configuración inicial", desc: "Actualizar la marca, el tono, los conocimientos y las redes elegidas." },
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
  searchParams: { client?: string; password?: string };
}) {
  const { client: slug, password } = searchParams;
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

        <section>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate/45">Cuenta</p>
          <div className="rounded-xl border border-ink/10 bg-paper p-5">
            <div className="mb-4">
              <h2 className="font-semibold text-ink">Cambiar contrasena</h2>
              <p className="mt-1 text-xs text-slate/70">Actualiza la clave del usuario con el que estas logueado.</p>
            </div>

            {password === "ok" ? (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Contrasena actualizada.
              </p>
            ) : password ? (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                No se pudo cambiar la contrasena. Revisar la clave actual y que la nueva coincida.
              </p>
            ) : null}

            <form action={changeOwnPassword} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="client" value={slug} />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate/70">Actual</span>
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/35"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate/70">Nueva</span>
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/35"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate/70">Repetir nueva</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/35"
                />
              </label>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink/90"
                >
                  Guardar contrasena
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

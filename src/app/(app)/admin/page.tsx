import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";

const cards = [
  { href: "/clients", title: "Clientes", desc: "Dominio (keywords/exclusiones), API key de OpenRouter y modelo por cliente." },
  { href: "/brands", title: "Marcas", desc: "Posicionamiento, tono y claims permitidos/prohibidos." },
  { href: "/personas", title: "Personas (voces)", desc: "Rol, tono, objetivos y ejemplos del quinteto." },
  { href: "/prompts", title: "Prompts", desc: "System prompt activo que se inyecta a la IA." },
  { href: "/products", title: "Productos", desc: "Catálogo: specs, garantía, stock y precio." },
  { href: "/knowledge", title: "Base de conocimiento", desc: "FAQs y objeciones que alimentan las respuestas." },
  { href: "/monitoring", title: "Monitoreo", desc: "Fuentes monitoreadas y detecciones recientes." }
];

export default async function AdminPage({ searchParams }: { searchParams?: { client?: string } }) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams?.client) ?? clients[0] ?? null;
  const clientQuery = activeClient ? `?client=${activeClient.slug}` : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">Administración</p>
        <h1 className="font-display text-4xl text-ink">
          Configuración{activeClient ? ` · ${activeClient.name}` : ""}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">Configuración del sistema sin tocar la base de datos.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={`${c.href}${clientQuery}`} className="rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel transition hover:-translate-y-0.5 hover:bg-white">
            <h2 className="font-display text-2xl text-ink">{c.title}</h2>
            <p className="mt-2 text-sm text-slate">{c.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

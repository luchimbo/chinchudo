import Link from "next/link";
import { prisma } from "@/lib/db";
import { withClient } from "@/components/studio/ui";

type Item = { key: string; label: string; detail: string; href: string; done: boolean };

/** Primeros pasos del Estudio. Se oculta sola cuando está todo hecho. */
export async function StudioChecklist({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const [products, personasWithExamples, approvedScripts, planned, references] = await Promise.all([
    prisma.product.count({ where: { brand: { clientId } } }),
    prisma.persona.count({ where: { clientId, NOT: { goodExamples: "" } } }),
    prisma.videoScript.count({ where: { clientId, status: "APPROVED" } }),
    prisma.contentIdea.count({ where: { clientId, plannedFor: { not: null } } }),
    prisma.referenceAccount.count({ where: { clientId, active: true } }),
  ]);
  const items: Item[] = [
    { key: "products", label: "Productos cargados", detail: "Los guiones hablan de tus productos reales.", href: withClient("/products", clientSlug), done: products > 0 },
    { key: "references", label: "Cuentas que mirás", detail: "Sumá al menos 3 cuentas de tu rubro para comparar qué les funciona.", href: withClient("/estudio/inspiracion?tab=cuentas", clientSlug), done: references >= 3 },
    { key: "voice", label: "Cómo habla tu marca", detail: "Sumá ejemplos en Personas o aprobá un guion: se usan como modelo.", href: withClient("/personas", clientSlug), done: personasWithExamples > 0 || approvedScripts > 0 },
    { key: "plan", label: "Primera semana planificada", detail: "Pedí una propuesta y aprobá las piezas que te gusten.", href: withClient("/estudio/plan", clientSlug), done: planned > 0 },
  ];
  const done = items.filter((item) => item.done).length;
  if (done === items.length) return null;
  return <section aria-label="Primeros pasos" className="overflow-hidden rounded-2xl border border-brass/25 bg-brass/[.06]">
    <p className="px-5 pt-4 text-[10px] font-black uppercase tracking-[.2em] text-brass">Para arrancar · {done}/{items.length}</p>
    <ol className="grid gap-px p-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => <li key={item.key}>
        <Link href={item.href} className="block h-full rounded-xl px-3 py-3 transition hover:bg-white/60">
          <p className={`text-sm font-bold ${item.done ? "text-moss" : "text-ink"}`}>{item.done ? "✓" : `${index + 1}.`} {item.label}</p>
          {!item.done && <p className="mt-1 text-xs leading-5 text-slate">{item.detail}</p>}
        </Link>
      </li>)}
    </ol>
  </section>;
}

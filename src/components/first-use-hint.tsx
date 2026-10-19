import Link from "next/link";
import { ManualOpportunitySearch } from "./manual-opportunity-search";
import type { FirstUseGoal } from "@/lib/onboarding-welcome";

export function FirstUseHint({ goal, clientSlug, clientId }: { goal: FirstUseGoal; clientSlug: string; clientId?: string }) {
  const query = `?client=${encodeURIComponent(clientSlug)}`;
  return <section className="mx-auto my-5 w-full max-w-6xl rounded-2xl border border-moss/20 bg-moss/5 p-5 sm:p-6">
    <h2 className="font-display text-2xl text-ink">{goal === "opportunities" ? "Buscá tu primera oportunidad." : goal === "responses" ? "Prepará tu primera respuesta." : "Prepará tu primer contenido."}</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate">{goal === "opportunities" ? "Elegí un tema de tu negocio para buscar conversaciones. Los resultados pueden tardar y también puede que no encontremos coincidencias." : goal === "responses" ? "Agregá una consulta y prepará un borrador. Podés revisarlo antes de usarlo." : "Elegí un tema y prepará un borrador. Podés completar la configuración del blog antes de publicar."}</p>
    {goal === "opportunities" && clientId ? <div className="mt-4"><ManualOpportunitySearch clientId={clientId} initialQuery="" /></div> : <Link href={`${goal === "content" ? "/blog/diseno" : "/opportunities/new"}${query}`} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper focus:outline-none focus:ring-4 focus:ring-moss/20">{goal === "content" ? "Preparar el blog" : "Agregar una consulta"} →</Link>}
  </section>;
}

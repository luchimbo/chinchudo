import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { loadBlogEvidence } from "@/lib/blog-evidence";
import { SourceForm } from "./source-form";
import { removeEditorialSource } from "./actions";

export const dynamic = "force-dynamic";
export default async function EditorialSourcesPage({ searchParams }: { searchParams: { client?: string } }) {
  const client = await requirePageClient(prisma, searchParams.client);
  if (client.slug !== "pcmidi") notFound();
  const evidence = await loadBlogEvidence(prisma, client.id);
  return <main className="mx-auto max-w-5xl px-5 py-7">
    <Link href="/blog/calendario?client=pcmidi" className="text-xs font-semibold text-moss underline">← Calendario</Link>
    <header className="mt-4 rounded-2xl bg-ink p-6 text-paper"><p className="text-xs uppercase tracking-widest text-paper/55">PC MIDI · Evidencia editorial</p><h1 className="mt-2 font-display text-3xl">Fuentes revisadas</h1><p className="mt-2 text-sm text-paper/70">Documentación y casos que respaldan datos técnicos, comparativas y recomendaciones.</p></header>
    <section className="mt-6 rounded-2xl border border-ink/10 bg-paper p-6"><h2 className="mb-4 font-display text-xl">Agregar evidencia</h2><SourceForm clientId={client.id} products={Object.entries(evidence.products).map(([id, p]) => ({ id, name: p.nombre }))} /></section>
    <section className="mt-6 rounded-2xl border border-ink/10 bg-paper p-6"><h2 className="font-display text-xl">Banco de fuentes</h2><p className="mt-1 text-sm text-slate">El catálogo propio y la base de conocimiento de confianza alta se incorporan automáticamente como fuentes propias. Una fuente independiente conserva su atribución.</p><div className="mt-4 divide-y divide-ink/10">{evidence.stored.map((s) => <article key={s.id} className="py-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{s.title}</h3><p className="text-xs text-slate">{s.type} · Revisada por {s.reviewedBy} · {new Date(s.verifiedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p></div><form action={removeEditorialSource}><input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="id" value={s.id} /><button className="text-xs text-rose-700 underline">Retirar del generador</button></form></div>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-sky-700 underline">{s.url}</a> : <p className="mt-2 text-xs text-slate">{s.reference}</p>}<ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">{s.claims.map((c, i) => <li key={i}>{c}</li>)}</ul></article>)}{!evidence.stored.length ? <p className="py-4 text-sm text-slate">Todavía no agregaste documentación externa ni casos revisados.</p> : null}</div></section>
  </main>;
}

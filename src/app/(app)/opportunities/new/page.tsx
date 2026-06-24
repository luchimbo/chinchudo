import Link from "next/link";
import { createOpportunity } from "../actions";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import {
  intentLabels,
  opportunityIntents,
  opportunityPriorities,
  priorityLabels
} from "@/lib/labels";

export default async function NewOpportunityPage({ searchParams }: { searchParams: { client?: string } }) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const [channels, brands, products] = await Promise.all([
    prisma.channel.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: activeClient ? { clientId: activeClient.id } : undefined, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: activeClient ? { brand: { clientId: activeClient.id } } : undefined,
      include: { brand: true },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }]
    })
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">
            Nueva oportunidad
          </p>
          <h1 className="font-display text-4xl text-ink">Cargar oportunidad</h1>
        </div>
        <Link
          href={activeClient ? `/oportunidades?client=${activeClient.slug}` : "/oportunidades"}
          className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white"
        >
          ← Oportunidades
        </Link>
      </header>

      <form
        action={createOpportunity}
        className="grid gap-5 rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur md:grid-cols-2"
      >
        <input type="hidden" name="client" value={activeClient?.slug ?? ""} />
        <label className="grid gap-2 text-sm font-semibold text-slate">
          Red
          <select name="channelId" required className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate">
          Autor visible
          <input
            name="sourceAuthor"
            placeholder="usuario, canal o perfil"
            maxLength={120}
            className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate md:col-span-2">
          URL
          <input
            name="sourceUrl"
            type="url"
            required
            placeholder="https://..."
            className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate">
          Marca detectada
          <select name="detectedBrandId" className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
            <option value="">Sin definir</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate">
          Producto detectado
          <select name="detectedProductId" className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
            <option value="">Sin definir</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.brand.name} - {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate">
          Intencion
          <select name="detectedIntent" className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
            {opportunityIntents.map((intent) => (
              <option key={intent} value={intent}>
                {intentLabels[intent]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate">
          Prioridad
          <select name="priority" className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
            {opportunityPriorities.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate md:col-span-2">
          Comentario original
          <textarea
            name="sourceText"
            required
            minLength={10}
            maxLength={4000}
            rows={6}
            placeholder="Pegar aca el comentario, duda o publicacion."
            className="resize-y rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate md:col-span-2">
          Nota interna
          <textarea
            name="notes"
            maxLength={2000}
            rows={3}
            placeholder="Contexto para Fede o Lucio."
            className="resize-y rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink"
          />
        </label>

        <div className="flex justify-end md:col-span-2">
          <button type="submit" className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper shadow-lg transition hover:bg-slate">
            Guardar oportunidad
          </button>
        </div>
      </form>
    </div>
  );
}

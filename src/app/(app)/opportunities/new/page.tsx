import Link from "next/link";
import { createOpportunity } from "../actions";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { OPPORTUNITY_CHANNEL_NAMES, YOUTUBE_OPPORTUNITY_CHANNEL_NAME } from "@/lib/opportunity-channels";
import {
  intentLabels,
  opportunityIntents,
  opportunityPriorities,
  priorityLabels
} from "@/lib/labels";

const fieldCls = "min-w-0 w-full rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink";
const labelCls = "grid min-w-0 gap-2 text-sm font-semibold text-slate";
export default async function NewOpportunityPage({ searchParams }: { searchParams: { client?: string } }) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const [channels, brands, products] = await Promise.all([
    prisma.channel.findMany({
      where: { name: { in: [...OPPORTUNITY_CHANNEL_NAMES] } },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({ where: activeClient ? { clientId: activeClient.id } : undefined, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: activeClient ? { brand: { clientId: activeClient.id } } : undefined,
      include: { brand: true },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }]
    })
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6 sm:px-5 sm:py-8">
      <header className="mb-8 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">
            Nueva oportunidad
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">Cargar oportunidad</h1>
        </div>
        <Link
          href={activeClient ? `/oportunidades?client=${activeClient.slug}` : "/oportunidades"}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white sm:w-auto"
        >
          ← Oportunidades
        </Link>
      </header>

      <form
        action={createOpportunity}
        className="grid min-w-0 gap-5 rounded-lg border border-ink/10 bg-white/70 p-3 shadow-panel backdrop-blur sm:p-5 md:grid-cols-2"
      >
        <input type="hidden" name="client" value={activeClient?.slug ?? ""} />
        <label className={labelCls}>
          Red
          <input type="hidden" name="channelId" value={channels[0]?.id ?? ""} />
          <div className={`${fieldCls} bg-ink/5 font-semibold`}>{YOUTUBE_OPPORTUNITY_CHANNEL_NAME}</div>
        </label>

        <label className={labelCls}>
          Autor visible
          <input
            name="sourceAuthor"
            placeholder="usuario, canal o perfil"
            maxLength={120}
            className={fieldCls}
          />
        </label>

        <label className={`${labelCls} md:col-span-2`}>
          URL
          <input
            name="sourceUrl"
            type="url"
            required
            placeholder="https://..."
            className={fieldCls}
          />
        </label>

        <label className={labelCls}>
          Marca detectada
          <select name="detectedBrandId" className={fieldCls}>
            <option value="">Sin definir</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelCls}>
          Producto detectado
          <select name="detectedProductId" className={fieldCls}>
            <option value="">Sin definir</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.brand.name} - {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelCls}>
          Intencion
          <select name="detectedIntent" className={fieldCls}>
            {opportunityIntents.map((intent) => (
              <option key={intent} value={intent}>
                {intentLabels[intent]}
              </option>
            ))}
          </select>
        </label>

        <label className={labelCls}>
          Prioridad
          <select name="priority" className={fieldCls}>
            {opportunityPriorities.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
        </label>

        <label className={`${labelCls} md:col-span-2`}>
          Comentario original
          <textarea
            name="sourceText"
            required
            minLength={10}
            maxLength={4000}
            rows={6}
            placeholder="Estoy buscando controladores MIDI hace tiempo, estoy entre este y el MiniLab 3 que me parece un poco mejor. Que opinion me podrias dar?"
            className={`${fieldCls} resize-y`}
          />
        </label>

        <label className={`${labelCls} md:col-span-2`}>
          Nota interna
          <textarea
            name="notes"
            maxLength={2000}
            rows={3}
            placeholder="Contexto interno para el equipo."
            className={`${fieldCls} resize-y`}
          />
        </label>

        <div className="flex min-w-0 justify-stretch md:col-span-2 md:justify-end">
          <button type="submit" className="w-full rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper shadow-lg transition hover:bg-slate sm:w-auto">
            Guardar oportunidad
          </button>
        </div>
      </form>
    </div>
  );
}

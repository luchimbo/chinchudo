import Link from "next/link";
import { Prisma } from "@prisma/client";
import { updateOpportunityStatus } from "@/app/(app)/opportunities/actions";
import { splitOpportunitySourcePreview } from "@/lib/opportunity-source-metadata";

export type OpportunityRow = Prisma.OpportunityGetPayload<{
  include: { channel: true };
}>;

function SourceLink({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center rounded-full border border-ink/15 font-bold text-ink transition hover:border-ink/40 hover:bg-white ${
        compact ? "h-8 px-3 text-xs" : "h-9 px-3 text-xs"
      }`}
    >
      Abrir fuente
    </a>
  );
}

export function OpportunityList({
  opportunities,
  clientSlug,
  emptyMessage = "No hay oportunidades que coincidan con el filtro.",
}: {
  opportunities: OpportunityRow[];
  clientSlug?: string;
  emptyMessage?: string;
}) {
  const clientQuery = clientSlug ? `?client=${encodeURIComponent(clientSlug)}` : "";

  if (opportunities.length === 0) {
    return <div className="px-5 py-12 text-center text-slate">{emptyMessage}</div>;
  }

  return (
    <div className="divide-y divide-ink/10">
      {opportunities.map((opportunity) => {
        const preview = splitOpportunitySourcePreview(opportunity.sourceText);

        return (
        <article key={opportunity.id} className="grid gap-4 px-5 py-4 transition hover:bg-paper/70 md:grid-cols-[120px_1fr_180px]">
          <div>
            <p className="text-sm font-bold text-ink">{opportunity.channel.name}</p>
            <p className="mt-1 text-xs text-slate/70">
              {opportunity.createdAt.toLocaleDateString("es-AR")}
            </p>
            <div className="mt-3 hidden md:block">
              <SourceLink href={opportunity.sourceUrl} compact />
            </div>
          </div>

          <div className="min-w-0">
            <p className="line-clamp-2 text-sm leading-6 text-ink">{preview.text}</p>
            {preview.commentCount || preview.publishedAgo ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate">
                {preview.commentCount ? <span>Comentarios: {preview.commentCount}</span> : null}
                {preview.publishedAgo ? <span>Publicado: {preview.publishedAgo}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
            <div className="md:hidden">
              <SourceLink href={opportunity.sourceUrl} compact />
            </div>
            {opportunity.status === "NEW" ? (
              <form action={updateOpportunityStatus}>
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <button name="status" value="NEEDS_REVIEW" className="h-9 rounded-full border border-ink/15 px-3 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white">
                  Revisar luego
                </button>
              </form>
            ) : null}
            {opportunity.status !== "DISCARDED" && opportunity.status !== "PUBLISHED" && opportunity.status !== "CONVERTED" ? (
              <form action={updateOpportunityStatus}>
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <button name="status" value="DISCARDED" className="h-9 rounded-full border border-ink/10 px-3 text-xs font-bold text-slate/65 transition hover:border-signal/30 hover:text-signal">
                  Descartar
                </button>
              </form>
            ) : null}
            <Link
              href={`/opportunities/${opportunity.id}${clientQuery}`}
              className="inline-flex h-9 items-center justify-center rounded-full bg-ink px-4 text-sm font-bold text-paper transition hover:bg-slate"
            >
              Ver post
            </Link>
          </div>
        </article>
        );
      })}
    </div>
  );
}

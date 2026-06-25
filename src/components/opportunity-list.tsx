import Link from "next/link";
import { Prisma } from "@prisma/client";
import { updateOpportunityStatus } from "@/app/(app)/opportunities/actions";
import {
  intentLabels,
  priorityLabels,
  statusLabels,
  type OpportunityIntentValue,
  type OpportunityPriorityValue,
  type OpportunityStatusValue,
} from "@/lib/labels";

export type OpportunityRow = Prisma.OpportunityGetPayload<{
  include: {
    channel: true;
    detectedBrand: true;
    detectedProduct: true;
    _count: { select: { responses: true } };
  };
}>;

function getPriorityClass(priority: string) {
  if (priority === "URGENT") return "bg-signal text-white";
  if (priority === "HIGH") return "bg-brass text-white";
  if (priority === "MEDIUM") return "bg-moss text-white";
  return "bg-ink/10 text-ink";
}

function getStatusClass(status: string) {
  if (status === "PUBLISHED" || status === "CONVERTED") return "border-moss/30 bg-moss/10 text-moss";
  if (status === "FOLLOW_UP" || status === "APPROVED") return "border-brass/40 bg-brass/10 text-brass";
  if (status === "DISCARDED") return "border-ink/10 bg-ink/5 text-ink/55";
  return "border-signal/30 bg-signal/10 text-signal";
}

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
        const missing = [
          !opportunity.detectedBrand ? "marca" : "",
          !opportunity.detectedProduct ? "producto" : "",
        ].filter(Boolean);
        const hasDraft = opportunity._count.responses > 0;
        return (
          <article key={opportunity.id} className="grid gap-4 px-5 py-4 transition hover:bg-paper/70 md:grid-cols-[120px_1fr_180px]">
            <div>
              <p className="text-sm font-bold text-ink">{opportunity.channel.name}</p>
              <p className="mt-1 text-xs text-slate/70">
                {opportunity.createdAt.toLocaleDateString("es-AR")}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate/60">
                {opportunity.sourceAuthor || "autor sin cargar"}
              </p>
              <div className="mt-3 hidden md:block">
                <SourceLink href={opportunity.sourceUrl} compact />
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${getPriorityClass(opportunity.priority)}`}>
                  {priorityLabels[opportunity.priority as OpportunityPriorityValue]}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(opportunity.status)}`}>
                  {statusLabels[opportunity.status as OpportunityStatusValue]}
                </span>
                <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-slate">
                  {intentLabels[opportunity.detectedIntent as OpportunityIntentValue]}
                </span>
                {hasDraft ? (
                  <span className="rounded-full border border-moss/25 bg-moss/10 px-3 py-1 text-xs font-bold text-moss">
                    {opportunity._count.responses} borradores
                  </span>
                ) : null}
                {missing.length > 0 ? (
                  <span className="rounded-full border border-brass/25 bg-brass/10 px-3 py-1 text-xs font-bold text-brass">
                    Falta {missing.join(" / ")}
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-sm leading-6 text-ink">{opportunity.sourceText}</p>
              <p className="mt-2 text-xs font-semibold text-slate/75">
                {opportunity.detectedBrand?.name ?? "Marca sin definir"}
                {opportunity.detectedProduct ? ` / ${opportunity.detectedProduct.name}` : ""}
              </p>
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
                Ver Post
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

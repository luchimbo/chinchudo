import Link from "next/link";
import { prisma } from "@/lib/db";

const STEP_STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-signal/10 text-signal",
  SENT: "bg-moss/10 text-moss",
  FAILED: "bg-signal/20 text-signal font-bold",
  SKIPPED: "bg-ink/5 text-ink/50",
};

function fmt(d: Date | null | string) {
  return d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page));
  const PAGE_SIZE = 20;

  const [total, leads] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.findMany({
      include: {
        nurtureSteps: { orderBy: { stepDay: "asc" } },
        leadMagnet: { select: { tipo: true, titulo: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">Leads</h1>
        </div>
        <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-slate">
          {total} leads totales
        </span>
      </header>

      {leads.length === 0 ? (
        <p className="text-sm text-slate">No hay leads registrados todavía.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {leads.map((lead) => (
            <div key={lead.id} className="rounded-xl border border-ink/10 bg-paper p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{lead.email}</p>
                  {lead.nombre && <p className="text-xs text-slate">{lead.nombre}</p>}
                  <p className="mt-0.5 text-xs text-slate">
                    Slug: <span className="font-mono">{lead.slug}</span>
                    {lead.keyword ? ` · ${lead.keyword}` : ""}
                  </p>
                  {lead.leadMagnet && (
                    <p className="mt-0.5 text-xs text-brass">
                      Lead magnet: {lead.leadMagnet.titulo}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate">{fmt(lead.createdAt)}</span>
              </div>

              {lead.nurtureSteps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {lead.nurtureSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-1.5">
                      <span className="text-xs text-slate">Día {step.stepDay}:</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STEP_STATUS_CLASS[step.status]}`}
                      >
                        {step.status.toLowerCase()}
                      </span>
                      {step.sentAt && (
                        <span className="text-xs text-slate">{fmt(step.sentAt)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {pageNum > 1 && (
            <Link
              href={`/leads?page=${pageNum - 1}`}
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm hover:bg-ink/5"
            >
              ← Anterior
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-slate">
            {pageNum} / {totalPages}
          </span>
          {pageNum < totalPages && (
            <Link
              href={`/leads?page=${pageNum + 1}`}
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm hover:bg-ink/5"
            >
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

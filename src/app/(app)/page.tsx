import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { operationalOpportunityWhere } from "@/lib/opportunity-channels";
import { getOnboardingProgress } from "@/lib/onboarding-progress";
import { sanitizeDraft } from "@/lib/onboarding";
import { OnboardingChecklist } from "@/components/onboarding-checklist";

type PageProps = { searchParams: { client?: string } };

function Metric({ label, value, note, tone = "ink" }: { label: string; value: number; note: string; tone?: "ink" | "moss" | "brass" }) {
  const color = { ink: "text-ink", moss: "text-moss", brass: "text-brass" }[tone];
  return (
    <div className="rounded-xl border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">{label}</p>
      <p className={`mt-2 font-display text-4xl leading-none ${color}`}>{value}</p>
      <p className="mt-2 text-xs text-slate/65">{note}</p>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const clientWhere = { clientId: client.id };
  const opportunityWhere = { ...clientWhere, ...operationalOpportunityWhere() };
  const workStatuses = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;

  const [pending, published, converted, landings, leads, onboarding] = await Promise.all([
    prisma.opportunity.count({ where: { ...opportunityWhere, status: { in: [...workStatuses] } } }),
    prisma.opportunity.count({ where: { ...opportunityWhere, status: "PUBLISHED" } }),
    prisma.opportunity.count({ where: { ...opportunityWhere, status: "CONVERTED" } }),
    prisma.landing.count({ where: clientWhere }),
    prisma.lead.count({ where: clientWhere }),
    client
      ? (prisma as any).clientOnboarding.findUnique({
          where: { clientId: client.id },
          select: { status: true, currentStep: true, sourceUrl: true, draft: true },
        })
      : Promise.resolve(null),
  ]);

  const withClient = (href: string) => client ? `${href}?client=${encodeURIComponent(client.slug)}` : href;

  // El draft mid-flow es la fuente de verdad (no se rehidrata acá: si ya está
  // COMPLETED, getOnboardingProgress lo marca invisible antes de mirar el draft).
  const onboardingProgress = client
    ? getOnboardingProgress({
        status: onboarding?.status ?? null,
        currentStep: onboarding?.currentStep ?? 1,
        sourceUrl: onboarding?.sourceUrl ?? "",
        draft: sanitizeDraft(onboarding?.draft, client.name),
        clientSlug: client.slug,
      })
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 lg:px-8">
      <header className="border-b border-ink/10 pb-7">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-moss">Centro de control · {client?.name ?? "Suite"}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mt-2 max-w-2xl text-sm text-slate">La vista general para decidir qué atender, publicar y medir hoy.</p>
          </div>
          <Link href={withClient("/copiloto")} className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-moss">
            Abrir Copiloto CM →
          </Link>
        </div>
      </header>

      {onboardingProgress ? <OnboardingChecklist progress={onboardingProgress} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Para atender" value={pending} note="Conversaciones activas" tone="brass" />
        <Metric label="Publicadas" value={published} note="Respuestas registradas" tone="moss" />
        <Metric label="Conversiones" value={converted} note="Resultados atribuidos" tone="moss" />
        <Metric label="Landings" value={landings} note="Piezas de contenido" />
        <Metric label="Leads" value={leads} note="Contactos captados" />
      </section>
    </div>
  );
}

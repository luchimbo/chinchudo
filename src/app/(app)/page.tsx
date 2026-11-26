import { redirect } from "next/navigation";
import { needsWelcome } from "@/lib/onboarding-welcome";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { operationalOpportunityWhere } from "@/lib/opportunity-channels";
import { getOnboardingProgress } from "@/lib/onboarding-progress";
import { sanitizeDraft } from "@/lib/onboarding";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { loadSystemHealth, type HealthAlert } from "@/lib/system-health";

type PageProps = { searchParams: { client?: string } };

const AREA_LABEL: Record<HealthAlert["area"], string> = { cm: "Asistente CM", listening: "Escucha", blog: "Blog", backup: "Copia de seguridad" };

/** Only rendered when something stopped working; a healthy suite shows nothing. */
function SystemHealth({ alerts, withClient }: { alerts: HealthAlert[]; withClient: (href: string) => string }) {
  if (!alerts.length) return null;
  return (
    <section aria-labelledby="system-health-heading" className="rounded-xl border border-signal/30 bg-signal/5 p-5">
      <h2 id="system-health-heading" className="text-xs font-bold uppercase tracking-[0.2em] text-signal">Estado del sistema</h2>
      <ul className="mt-3 grid gap-2">
        {alerts.map((alert) => (
          <li key={`${alert.area}:${alert.message}`}>
            <Link href={withClient(alert.href)} className="flex flex-col gap-0.5 rounded-lg bg-paper px-4 py-3 text-sm transition hover:bg-white sm:flex-row sm:items-baseline sm:gap-3">
              <span className={`shrink-0 text-xs font-bold ${alert.level === "error" ? "text-signal" : "text-brass"}`}>{AREA_LABEL[alert.area]}</span>
              <span className="text-ink">{alert.message}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Metric({
  label,
  value,
  note,
  href,
  tone = "ink",
}: {
  label: string;
  value: number;
  note: string;
  href: string;
  tone?: "ink" | "moss" | "brass";
}) {
  const color = { ink: "text-ink", moss: "text-moss", brass: "text-brass" }[tone];
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${note}`}
      className="group rounded-xl border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur transition duration-150 hover:-translate-y-0.5 hover:border-ink/25 hover:bg-white hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-ink/15"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">{label}</p>
      <p className={`mt-2 font-display text-4xl leading-none ${color}`}>{value}</p>
      <p className="mt-2 text-xs text-slate/65 transition group-hover:text-slate">{note}</p>
    </Link>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const welcomeOnboarding = await prisma.clientOnboarding.findUnique({ where: { clientId: client.id } });
  if (needsWelcome(welcomeOnboarding?.status, sanitizeDraft(welcomeOnboarding?.draft))) redirect(`/bienvenida?client=${encodeURIComponent(client.slug)}`);
  const clientWhere = { clientId: client.id };
  const opportunityWhere = { ...clientWhere, ...operationalOpportunityWhere() };
  const workStatuses = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;

  const [pending, published, landings, onboarding, healthAlerts] = await Promise.all([
    prisma.opportunity.count({ where: { ...opportunityWhere, status: { in: [...workStatuses] } } }),
    prisma.opportunity.count({ where: { ...opportunityWhere, status: "PUBLISHED" } }),
    prisma.landing.count({ where: clientWhere }),
    Promise.resolve(welcomeOnboarding),
    // Health must never take the home page down with it.
    loadSystemHealth(prisma, client.id).catch(() => [] as HealthAlert[]),
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
        <div className="mt-3 flex flex-wrap items-end justify-end gap-5">
          <Link href={withClient("/asistente-cm")} className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-moss">
            Abrir Asistente CM →
          </Link>
        </div>
      </header>

      {onboardingProgress ? <OnboardingChecklist progress={onboardingProgress} /> : null}

      <SystemHealth alerts={healthAlerts} withClient={withClient} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Para atender" value={pending} note="Conversaciones activas" href={withClient("/asistente-cm")} tone="brass" />
        <Metric label="Publicadas" value={published} note="Respuestas registradas" href={withClient("/historial")} tone="moss" />
        <Metric label="Artículos" value={landings} note="Artículos del blog" href={withClient("/blog")} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { CONTEXT_PLATFORMS, loadSwipeSummary } from "@/lib/studio/sources";
import { getFormula, multiplePhrase } from "@/lib/reel-craft";
import { Card, Chip, EmptyState, NextStepLink, SectionTitle, StepHeader, withClient } from "@/components/studio/ui";
import { StudioChecklist } from "../studio-checklist";
import { ReferenceList } from "./reference-list";
import { ReferenceAccounts, type AccountRow } from "./reference-accounts";

type PageProps = { searchParams: { client?: string; tab?: string } };

const CONTEXT_LABEL: Record<string, string> = { GOOGLE_NEWS: "Noticias", ARGENTINE_PRESS: "Prensa", ARGENTINE_STREAMING_MEDIA: "Streaming", ARGENTINA_DATA: "Datos públicos", URL_ARTICLE: "Artículo", PODCAST: "Podcast", GOOGLE_TRENDS: "Google", TWITTER: "X" };

function ageLabel(date: Date) {
  const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86_400_000));
  return days === 0 ? "Hoy" : days === 1 ? "Ayer" : `Hace ${days} días`;
}

export default async function InspiracionPage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const tab = searchParams.tab === "tema" ? "tema" : searchParams.tab === "cuentas" ? "cuentas" : "referencias";
  const [{ references, summary }, context, accounts] = await Promise.all([
    loadSwipeSummary(client.id),
    tab === "tema" ? prisma.trend.findMany({ where: { clientId: client.id, platform: { in: CONTEXT_PLATFORMS }, createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } }, orderBy: { createdAt: "desc" }, take: 40 }) : Promise.resolve([]),
    prisma.referenceAccount.findMany({ where: { clientId: client.id }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
  ]);
  const reelsPerAccount = new Map<string, number>();
  for (const reference of references) {
    const id = reference.metadata && typeof reference.metadata === "object" ? (reference.metadata as Record<string, unknown>).referenceAccountId : null;
    if (typeof id === "string") reelsPerAccount.set(id, (reelsPerAccount.get(id) ?? 0) + 1);
  }
  const accountRows: AccountRow[] = accounts.map((account) => ({ id: account.id, platform: account.platform, handle: account.handle, url: account.url, kind: account.kind, active: account.active, medianViews: account.medianViews, lastScannedAt: account.lastScannedAt?.toISOString() ?? null, scanRequestedAt: account.scanRequestedAt?.toISOString() ?? null, lastError: account.lastError, reels: reelsPerAccount.get(account.id) ?? 0 }));
  const tabLink = (value: string) => withClient(`/estudio/inspiracion${value === "referencias" ? "" : `?tab=${value}`}`, client.slug);

  return <div className="space-y-8">
    <StepHeader step={1} title="Inspiración" description={`Videos que le están funcionando a otras cuentas del rubro de ${client.name}. No se copian: se toma la idea y el tipo de gancho, y se cuenta con tus productos.`} action={<NextStepLink href={withClient("/estudio/plan", client.slug)}>Ir al plan de la semana</NextStepLink>} />
    <StudioChecklist clientId={client.id} clientSlug={client.slug} />

    <div className="flex gap-1 border-b border-ink/10" role="tablist">
      {[["referencias", "Videos de referencia"], ["cuentas", `Cuentas que mirás (${accounts.filter((account) => account.active).length})`], ["tema", "Tema del día"]].map(([value, label]) => <Link key={value} role="tab" aria-selected={tab === value} href={tabLink(value)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${tab === value ? "border-ink text-ink" : "border-transparent text-slate/70 hover:text-ink"}`}>{label}</Link>)}
    </div>

    {tab === "referencias" ? <>
      <section>
        <SectionTitle hint={`${summary.sampleSize} referencias · ${summary.confidence === "solido" ? "muestra suficiente" : "es orientativo, todavía hay pocos datos"}`}>Lo que funciona en tu rubro</SectionTitle>
        {summary.formulas.length ? <div className="grid gap-4 md:grid-cols-3">
          {summary.formulas.slice(0, 3).map((entry) => {
            const formula = getFormula(entry.formulaId);
            return <Card key={entry.formulaId}>
              <Chip tone="bg-brass/10 text-brass">Tipo de gancho</Chip>
              <h3 className="mt-2 font-display text-xl font-bold">{entry.name}</h3>
              {formula && <p className="mt-1 text-sm text-slate">Ej.: “{formula.example}”</p>}
              <p className="mt-3 text-sm font-bold text-moss">Aparece en {entry.topCount} de los videos que mejor les fue.</p>
              <ul className="mt-3 space-y-1 text-xs text-slate">{entry.examples.map((example) => <li key={example.id} className="line-clamp-1">· {example.sourceUrl ? <a href={example.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-ink/20 underline-offset-2">{example.title}</a> : example.title}{multiplePhrase(example.multiple) ? ` (${multiplePhrase(example.multiple)})` : ""}</li>)}</ul>
              {formula && <p className="mt-3 text-xs text-slate"><span className="font-bold text-ink">Ojo: </span>{formula.trap}</p>}
            </Card>;
          })}
        </div> : <EmptyState title="Todavía no hay datos suficientes" body="Cuando el radar junte videos de tu rubro, acá vas a ver qué tipos de gancho les funcionan mejor." />}
        {summary.basis === "estimado" && summary.formulas.length > 0 && <p className="mt-3 text-xs text-slate">Por ahora se ordena por el análisis de cada video; cuando haya vistas comparables de cada cuenta, el ranking va a ser más preciso.</p>}
      </section>

      <section>
        <SectionTitle hint="Elegí las que te sirvan y mandalas al plan">Videos de referencia</SectionTitle>
        {references.length ? <ReferenceList references={references} /> : <EmptyState title="Todavía no hay referencias" body="El radar busca videos del rubro todos los días. Cuando encuentre, aparecen acá." />}
      </section>
    </> : tab === "cuentas" ? <ReferenceAccounts clientId={client.id} accounts={accountRows} /> : <section>
      <SectionTitle hint="Temas de la semana para un guiño oportuno. Revisá la sensibilidad antes de usar uno.">Tema del día</SectionTitle>
      {context.length ? <div className="grid gap-3 md:grid-cols-2">
        {context.map((signal) => {
          const metadata = signal.metadata && typeof signal.metadata === "object" ? signal.metadata as Record<string, unknown> : {};
          const sensitive = metadata.sensitivity === "needs_review";
          return <Card key={signal.id}>
            <div className="flex flex-wrap items-center gap-2"><Chip>{typeof metadata.outlet === "string" && metadata.outlet ? metadata.outlet : CONTEXT_LABEL[signal.platform] ?? signal.platform}</Chip><span className="text-xs text-slate">{ageLabel(signal.createdAt)}</span>{sensitive && <Chip tone="bg-signal/10 text-signal">Revisar antes de usar</Chip>}</div>
            <h3 className="mt-2 font-bold leading-snug">{signal.title.replace(/^(Coyuntura|Google Trend|X\/Twitter Trend):\s*/i, "")}</h3>
            {signal.sourceUrl && <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold underline decoration-ink/30 underline-offset-4">Ver fuente ↗</a>}
          </Card>;
        })}
      </div> : <EmptyState title="Sin temas recientes" body="El radar de coyuntura no encontró temas en las últimas dos semanas." />}
    </section>}
  </div>;
}

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess, getVisibleClients } from "@/lib/auth";
import { updateLandingsConfig, updateEmailConfig, updateExcludedProducts, updatePriorityCompetitors, discoverPriorityCompetitors } from "./actions";
import { ExcludedProductsForm } from "./excluded-products-form";
import { loadBlogCatalog, parsePriorityCompetitors, priorityCompetitorsKey } from "@/lib/blog-day-plan";
import { LandingsForm } from "./landings-form";
import { EmailsForm } from "./emails-form";
import { CatalogSyncPanel } from "./catalog-sync-panel";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { blogPreferences, editorialCalendarEnabled } from "@/lib/blog-language";

type GenerationSchedule = { enabled: boolean; intervalHours: number; limit: number; weeklyTarget: number };
type DailyBlogSchedule = { enabled: boolean; publishTime: string; autoApprove: boolean; articlePlan?: unknown };

function parseSchedule(value: string | null): GenerationSchedule {
  try {
    const raw = JSON.parse(value || "{}");
    return { enabled: Boolean(raw.enabled), intervalHours: Math.min(168, Math.max(1, Number(raw.intervalHours) || 24)), limit: Math.min(5, Math.max(1, Number(raw.limit) || 3)), weeklyTarget: Math.min(10, Math.max(2, Number(raw.weeklyTarget) || 10)) };
  } catch {
    return { enabled: false, intervalHours: 24, limit: 3, weeklyTarget: 10 };
  }
}

function parseDailyBlogSchedule(value: string | null): DailyBlogSchedule {
  try {
    const raw = JSON.parse(value || "{}");
    return { enabled: Boolean(raw.enabled), publishTime: typeof raw.publishTime === "string" ? raw.publishTime : "12:00", autoApprove: raw.autoApprove === true, articlePlan: raw.articlePlan };
  } catch {
    return { enabled: false, publishTime: "12:00", autoApprove: false };
  }
}

function researchSources(value: string | null | undefined): { name: string; sourceUrl: string }[] {
  try {
    const raw = JSON.parse(value || "{}");
    return Array.isArray(raw.sources) ? raw.sources.filter((item: any) => typeof item?.name === "string" && typeof item?.sourceUrl === "string" && item.sourceUrl.startsWith("https://")) : [];
  } catch { return []; }
}

export default async function LandingsConfigPage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const requestedSlug = searchParams.client;
  const visibleClients = requestedSlug ? [] : await getVisibleClients(prisma);
  const slug = requestedSlug ?? visibleClients[0]?.slug;
  if (!slug) notFound();
  if (!requestedSlug) redirect(`/blog/configuracion?client=${encodeURIComponent(slug)}`);

  const c = await prisma.client.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      responsePolicy: true,
      logoUrl: true,
      storeUrl: true,
      blogBaseUrl: true,
      autoApprove: true,
      autoPublish: true,
      fromName: true,
      fromEmail: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      labName: true,
      unsubscribeBaseUrl: true,
      trackBaseUrl: true,
    },
  });

  if (!c) notFound();
  try {
    await assertClientAccess(prisma, c.id);
  } catch {
    notFound();
  }
  const [generationSetting, dailySetting, blogCatalog, prioritySetting, researchSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: `landing_generation_schedule:${c.id}` }, select: { value: true } }),
    prisma.appSetting.findUnique({ where: { key: `blog_daily_schedule:${c.id}` }, select: { value: true } }),
    editorialCalendarEnabled(c) ? loadBlogCatalog(prisma, c.id) : Promise.resolve(null),
    editorialCalendarEnabled(c) ? prisma.appSetting.findUnique({ where: { key: priorityCompetitorsKey(c.id) }, select: { value: true } }) : Promise.resolve(null),
    editorialCalendarEnabled(c) ? prisma.appSetting.findUnique({ where: { key: `blog_priority_competitor_research:${c.id}` }, select: { value: true } }) : Promise.resolve(null),
  ]);
  const schedule = parseSchedule(generationSetting?.value ?? null);
  const dailyBlogSchedule = parseDailyBlogSchedule(dailySetting?.value ?? null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-ink">Configuración del blog y emails</h1>
        <p className="mt-1 text-sm text-slate">
          Logo, URLs base, automatizaciones y servidor de correos SMTP para este cliente.
        </p>
      </header>

      {slug === "pcmidi" ? <CatalogSyncPanel clientId={c.id} /> : null}
      {blogCatalog?.products.length ? <section className="mt-8 rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">Productos propios excluidos</h2>
        <p className="mb-4 mt-1 text-sm text-slate">No tendrán protagonismo ni se nombrarán en artículos nuevos. Para excluirlos solo un día, usá el calendario.</p>
        <ExcludedProductsForm clientId={c.id} products={blogCatalog.products} excluded={blogCatalog.excluded} action={updateExcludedProducts} />
      </section> : null}
      {blogCatalog?.products.length ? <section className="mt-8 rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">Productos negativos de la competencia</h2>
        <p className="mb-4 mt-1 text-sm text-slate">Modelos rivales que queremos priorizar en las comparativas automáticas. Uno por línea. Cada comparación debe apoyarse en datos verificables y queda para revisión humana antes de publicarse.</p>
        <form action={updatePriorityCompetitors} className="space-y-3">
          <input type="hidden" name="id" value={c.id} />
          <textarea name="competitors" rows={5} maxLength={5000} defaultValue={parsePriorityCompetitors(prioritySetting?.value).join("\n")} placeholder="Yamaha P-225&#10;Roland FP-30X" className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-sm text-ink" />
          <p className="text-xs text-slate">Se usan cuando está activada la comparativa automática. Un rival elegido en el calendario tiene prioridad para esa fecha.</p>
          <PendingSubmitButton loadingText="Guardando…" className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">Guardar competidores</PendingSubmitButton>
        </form>
        <form action={discoverPriorityCompetitors} className="mt-3">
          <input type="hidden" name="id" value={c.id} />
          <PendingSubmitButton loadingText="Investigando…" className="rounded-lg border border-ink/20 px-3 py-2 text-sm font-semibold text-ink">Buscar rivales con IA</PendingSubmitButton>
        </form>
        {researchSources(researchSetting?.value).length ? <div className="mt-4 text-xs text-slate">
          <p className="font-semibold">Fichas oficiales usadas en la última búsqueda:</p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{researchSources(researchSetting?.value).map(item => <li key={item.sourceUrl}><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{item.name}</a></li>)}</ul>
        </div> : null}
      </section> : null}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Columna Izquierda: Landings */}
        <section className="rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">URLs y Comportamiento</h2>
          <LandingsForm
            config={{
              id: c.id,
              clientSlug: slug,
              blogLanguage: blogPreferences(c.responsePolicy).language,
              blogComparisons: blogPreferences(c.responsePolicy).comparisons,
              editorialCalendar: editorialCalendarEnabled(c),
              logoUrl: c.logoUrl ?? "",
              storeUrl: c.storeUrl ?? "",
              blogBaseUrl: c.blogBaseUrl ?? "",
              autoApprove: c.autoApprove ?? false,
              autoPublish: c.autoPublish ?? false,
              generationSchedule: schedule,
              dailyBlogSchedule,
            }}
            updateLandingsConfig={updateLandingsConfig}
          />
        </section>

        {/* Columna Derecha: Emails */}
        <section className="rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">Salida de Emails (Nurturing)</h2>
          <EmailsForm
            config={{
              id: c.id,
              fromName: c.fromName ?? "",
              fromEmail: c.fromEmail ?? "",
              labName: c.labName ?? "",
              smtpHost: c.smtpHost ?? "",
              smtpPort: c.smtpPort ?? 465,
              smtpUser: c.smtpUser ?? "",
              hasSmtpPass: !!c.smtpPass,
              unsubscribeBaseUrl: c.unsubscribeBaseUrl ?? "",
              trackBaseUrl: c.trackBaseUrl ?? "",
            }}
            updateEmailConfig={updateEmailConfig}
          />
        </section>
      </div>
    </div>
  );
}

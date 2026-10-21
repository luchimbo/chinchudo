import { FirstUseHint } from "@/components/first-use-hint";
import { BLOG_LANGUAGES, blogPreferences, editorialCalendarEnabled } from "@/lib/blog-language";
import { findTranslations } from "@/lib/blog-translations";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Suspense } from "react";
import { LoadingSpinner, LoadingMessage } from "@/components/loading-ui";
import { PendingNavigationLink as Link } from "@/components/pending-navigation-link";
import { ArticlePreviewButton } from "@/components/article-preview";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { dateOnly, monthBounds, shiftDate } from "@/lib/blog-calendar";
import { businessTimezone, localDay } from "@/lib/business-analysis";
import { addBlogDays, replaceBlogArticle, restoreBlogDate, skipBlogDate, retryBlogPreparation, approveAnalysisArticle } from "./actions";
import { RescheduleForm } from "./reschedule-form";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";
import { balanceWarnings, intentForSlot, intentModeOf, loadIntentNeighbors } from "@/lib/blog-intent.mjs";
import { blogReferral } from "@/lib/blog-referrals";
import { PublishArticleButton } from "./publish-article-button";
import { DeleteLandingButton } from "../delete-landing-button";
import { CalendarDetail } from "./calendar-detail";
import { GenerateDateForm, PreparationStatus } from "./generate-date-form";
import { calendarHref, validCalendarDay } from "@/lib/blog-navigation";
import { AgentConnection } from "./agent-connection";
import { preparationLabel } from "@/lib/blog-tasks";
import { blogTaskError } from "@/lib/blog-task-errors";
import { GenerationActionButton } from "./generation-action-button";
import { WeekPlanner } from "./week-planner";
import { dayPlanFrom, loadBlogCatalog, parsePriorityCompetitors, priorityCompetitorsKey, type BlogDayPlan } from "@/lib/blog-day-plan";

function preparationField(value: unknown, field: string) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return typeof metadata[field] === "string" ? metadata[field] as string : "";
}
const preparationPhase = (value: unknown) => preparationField(value, "phase");
const preparationBrief = (value: unknown) => preparationField(value, "brief");

/** Producto protagonista y rival de un día, visibles en la grilla del mes. */
function PlanChips({ plan, productName }: { plan: BlogDayPlan; productName: Map<string, string> }) {
  const product = plan.productId ? productName.get(plan.productId) || "Producto elegido" : "";
  if (!product && !plan.competitor) return null;
  return <span className="mt-1.5 flex min-w-0 flex-col gap-0.5">
    {product ? <span title={product} className="block max-w-full truncate self-start rounded bg-moss/10 px-1 py-0.5 text-[9px] font-medium text-moss sm:text-[10px]">{product}</span> : null}
    {plan.competitor ? <span title={`vs ${plan.competitor}`} className="block max-w-full truncate self-start rounded bg-brass/10 px-1 py-0.5 text-[9px] font-medium text-brass sm:text-[10px]">vs {plan.competitor}</span> : null}
  </span>;
}

const LANGUAGE_NAMES: Record<string, string> = { es: "Español", en: "Inglés", de: "Alemán" };
const HISTORY_REASONS: Record<string, string> = { reschedule: "Reprogramado", published_early: "Publicado antes de fecha", displaced: "Movido por una publicación anticipada" };
type DateHistoryItem = { at: string; from: string; to: string; reason: string };
function dateHistory(value: unknown): DateHistoryItem[] {
  const history = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).dateHistory : null;
  return Array.isArray(history) ? history.filter((item): item is DateHistoryItem => !!item && typeof item.at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.from) && /^\d{4}-\d{2}-\d{2}$/.test(item.to)) : [];
}
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const STATUS: Record<string, { label: string; style: string }> = {
  PLANNED: { label: "Preparando", style: "border-amber-200 bg-amber-50 text-amber-800" },
  READY: { label: "Listo", style: "border-sky-200 bg-sky-50 text-sky-800" },
  PUBLISHING: { label: "Publicando", style: "border-violet-200 bg-violet-50 text-violet-800" },
  PUBLISHED: { label: "Publicado", style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  FAILED: { label: "Bloqueado", style: "border-rose-200 bg-rose-50 text-rose-800" },
  SKIPPED: { label: "Omitido", style: "border-ink/10 bg-ink/5 text-slate" },
};

export default async function BlogCalendarPage({ searchParams }: { searchParams: { firstUse?: string; client?: string; month?: string; day?: string; rescheduled?: string; requestedDate?: string; publication?: string } }) {
  const activeClient = await requirePageClient(prisma, searchParams.client);
  const calendarEnabled = editorialCalendarEnabled(activeClient);

  const today = localDay(new Date(), businessTimezone(activeClient.responsePolicy));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.month || "") ? searchParams.month! : today.slice(0, 7);
  const { start, end } = monthBounds(month);
  const [slots, setting, lastSlot] = await Promise.all([
    prisma.blogPublication.findMany({
      where: { clientId: activeClient.id, scheduledDate: { gte: start, lt: end } },
      include: { landing: { select: { id: true, titulo: true, slug: true, indexingState: true, publicPreviewUrl: true, contentCluster: { select: { slug: true } } } } },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.appSetting.findUnique({ where: { key: `blog_daily_schedule:${activeClient.id}` }, select: { value: true } }),
    prisma.blogPublication.findFirst({ where: { clientId: activeClient.id, status: { not: "SKIPPED" } }, orderBy: { scheduledDate: "desc" }, select: { scheduledDate: true } }),
  ]);
  let config: { enabled?: boolean; publishTime?: string; autoApprove?: boolean; firstPublishDate?: string } = {};
  try { config = JSON.parse(setting?.value || "{}"); } catch { /* Se muestra como apagado. */ }
  const lastPlanned = lastSlot ? lastSlot.scheduledDate.toISOString().slice(0, 10) : "";
  const formatDay = (day: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const rescheduledSlot = slots.find(slot => slot.id === searchParams.rescheduled);
  let requestedDate = "";
  try { requestedDate = dateOnly(searchParams.requestedDate || "").toISOString().slice(0, 10); } catch { /* Sin aviso para parámetros inválidos. */ }
  const rescheduledDate = rescheduledSlot?.scheduledDate.toISOString().slice(0, 10);
  const selectedDay = validCalendarDay(searchParams.day || rescheduledDate, month);
  const selectedSlots = slots.filter(slot => slot.scheduledDate.toISOString().slice(0, 10) === selectedDay);
  const selected = selectedSlots.find(slot => slot.id === (searchParams.publication || searchParams.rescheduled)) || selectedSlots[0];
  const selectedTranslations = selected?.landingId ? await findTranslations(prisma, activeClient.id, selected.landingId) : [];

  // El idioma vive dentro del contenido del artículo: se extrae en la base sin traer todo el texto.
  const articleIds = slots.flatMap(slot => slot.landingId ? [slot.landingId] : []);
  const languageRows = articleIds.length ? await prisma.$queryRaw<{ id: string; lang: string | null }[]>`SELECT id, substring("htmlContent" from '"language"[[:space:]]*:[[:space:]]*"([a-z]{2})"') AS lang FROM "Landing" WHERE id = ANY(${articleIds})` : [];
  const languageOf = new Map(languageRows.map(row => [row.id, row.lang || "es"]));
  // Versiones por idioma de cada artículo (el original más sus traducciones), para mostrarlas juntas en la grilla.
  const versionRows = articleIds.length ? await prisma.$queryRaw<{ titulo: string; lang: string | null; parent: string | null }[]>`SELECT titulo, substring("htmlContent" from '"language"[[:space:]]*:[[:space:]]*"([a-z]{2})"') AS lang, substring("htmlContent" from '"translation_of"[[:space:]]*:[[:space:]]*"([^"]+)"') AS parent FROM "Landing" WHERE "clientId" = ${activeClient.id} AND "htmlContent" LIKE '%"translation_of"%'` : [];
  const versionsOf = new Map<string, Map<string, string>>();
  for (const slot of slots) {
    if (!slot.landingId) continue;
    const versions = new Map<string, string>([[languageOf.get(slot.landingId) || "es", slot.landing?.titulo || ""]]);
    for (const row of versionRows) if (row.parent === slot.landingId && !versions.has(row.lang || "es")) versions.set(row.lang || "es", row.titulo);
    versionsOf.set(slot.landingId, versions);
  }
  const versionLanguages = (landingId: string | null | undefined) => (["es", "de", "en"] as const).filter(language => landingId && versionsOf.get(landingId)?.has(language));
  const displayTitle = (slot: (typeof slots)[number]) => (slot.landingId && versionsOf.get(slot.landingId)?.get("es")) || slot.landing?.titulo || "";

  const landingIds = selected?.status === "PUBLISHED" && selected.landingId ? [selected.landingId] : [];
  const [events, leads] = landingIds.length ? await Promise.all([
    prisma.trackingEvent.groupBy({
      by: ["landingId", "eventType"], _count: { id: true },
      where: { clientId: activeClient.id, landingId: { in: landingIds }, eventType: { in: ["page_view", "store_click"] } },
    }),
    prisma.lead.groupBy({ by: ["landingId"], _count: { id: true }, where: { clientId: activeClient.id, landingId: { in: landingIds } } }),
  ]) : [[], []];
  const metrics = new Map<string, { views: number; clicks: number; leads: number }>();
  for (const id of landingIds) metrics.set(id, { views: 0, clicks: 0, leads: 0 });
  for (const event of events) {
    if (!event.landingId) continue;
    const value = metrics.get(event.landingId);
    if (value) value[event.eventType === "page_view" ? "views" : "clicks"] = event._count.id;
  }
  for (const lead of leads) if (lead.landingId) {
    const value = metrics.get(lead.landingId);
    if (value) value.leads = lead._count.id;
  }
  // Contexto para leer las visitas: promedio de los demás artículos publicados del cliente.
  let peerAverage: number | null = null;
  if (selected?.status === "PUBLISHED" && selected.landingId) {
    const [peerCount, peerViews] = await Promise.all([
      prisma.blogPublication.count({ where: { clientId: activeClient.id, status: "PUBLISHED", landingId: { not: selected.landingId } } }),
      prisma.trackingEvent.count({ where: { clientId: activeClient.id, eventType: "page_view", landingId: { not: selected.landingId }, landing: { blogPublication: { is: { status: "PUBLISHED" } } } } }),
    ]);
    if (peerCount >= 3) peerAverage = Math.round(peerViews / peerCount);
  }
  const referrals = landingIds.length ? await prisma.trackingEvent.groupBy({ by: ["landingId", "referrer"], _count: { id: true }, where: { clientId: activeClient.id, landingId: { in: landingIds }, eventType: "page_view" } }) : [];
  const referralStats = new Map<string, Map<string, number>>();
  for (const row of referrals) {
    if (!row.landingId) continue;
    const entries = referralStats.get(row.landingId) || new Map<string, number>();
    const label = blogReferral(row.referrer);
    entries.set(label, (entries.get(label) || 0) + row._count.id);
    referralStats.set(row.landingId, entries);
  }

  const byDay = new Map([...slots].reverse().map((slot) => [slot.scheduledDate.toISOString().slice(0, 10), slot]));
  const leading = (start.getUTCDay() + 6) % 7;
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const calendarDays = Array.from({ length: leading + daysInMonth }, (_, index) => index < leading ? "" : shiftDate(`${month}-01`, index - leading));
  while (calendarDays.length % 7) calendarDays.push("");
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const next = end.toISOString().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  const blogBase = (activeClient.blogBaseUrl || (activeClient.slug === "pcmidi" ? "https://blog.pcmidicenter.com" : "")).replace(/\/$/, "");
  const firstDate = config.firstPublishDate && config.firstPublishDate > today ? config.firstPublishDate : today;
  // Primer día libre para «Nuevo artículo»: sin reserva o reservado y todavía sin empezar.
  const tomorrow = shiftDate(today, 1);
  const futureSlots = calendarEnabled ? await prisma.blogPublication.findMany({ where: { clientId: activeClient.id, scheduledDate: { gte: dateOnly(tomorrow), lt: dateOnly(shiftDate(tomorrow, 120)) } }, select: { scheduledDate: true, status: true, landingId: true, preparation: true } }) : [];
  const takenDays = new Set(futureSlots.filter(slot => slot.landingId || slot.status !== "PLANNED" || !["", "WAITING"].includes(preparationPhase(slot.preparation))).map(slot => slot.scheduledDate.toISOString().slice(0, 10)));
  // Modo balanced: tipo sugerido por cuota y avisos de equilibrio calculados sobre los próximos meses.
  const balanced = calendarEnabled && intentModeOf(activeClient.responsePolicy) === "balanced";
  const intentNeighbors = balanced ? (await loadIntentNeighbors(prisma, activeClient.id, today, shiftDate(today, 120))).neighbors : [];
  const balanceNotes = balanced ? balanceWarnings(intentNeighbors.filter(item => item.day >= today)) : [];
  let nextFreeDay = tomorrow;
  while (takenDays.has(nextFreeDay)) nextFreeDay = shiftDate(nextFreeDay, 1);
  const [upcoming, catalog, blogCatalog] = await Promise.all([
    prisma.blogPublication.findFirst({ where: { clientId: activeClient.id, scheduledDate: { gte: dateOnly(firstDate) }, status: "READY", ...(config.autoApprove ? {} : { requiresApproval: false }) }, orderBy: { scheduledDate: "asc" }, include: { landing: { select: { titulo: true } } } }),
    activeClient.slug === "pcmidi" ? prisma.catalogSyncRun.findFirst({ where: { clientId: activeClient.id }, orderBy: { startedAt: "desc" }, select: { status: true } }) : Promise.resolve(null),
    calendarEnabled ? loadBlogCatalog(prisma, activeClient.id) : Promise.resolve({ products: [], excluded: [] }),
  ]);
  const competitorSetting = calendarEnabled ? await prisma.appSetting.findUnique({ where: { key: priorityCompetitorsKey(activeClient.id) }, select: { value: true } }) : null;
  const priorityCompetitors = parsePriorityCompetitors(competitorSetting?.value);
  const productName = new Map(blogCatalog.products.map(product => [product.id, product.name]));
  const selectedPlan = selected ? dayPlanFrom(selected.preparation) : {};
  const selectedHistory = selected ? dateHistory(selected.preparation) : [];
  const preferences = blogPreferences(activeClient.responsePolicy);
  // Aviso de día sin publicar: hoy no salió nada y ya pasó el horario (o no hay publicación automática).
  const [todaySlot, missedRecent] = calendarEnabled ? await Promise.all([
    prisma.blogPublication.findUnique({ where: { clientId_scheduledDate: { dailySlot: 0, clientId: activeClient.id, scheduledDate: dateOnly(today) } }, select: { status: true, requiresApproval: true, landingId: true, landing: { select: { titulo: true } } } }),
    prisma.blogPublication.count({ where: { clientId: activeClient.id, status: "SKIPPED", landingId: { not: null }, scheduledDate: { gte: dateOnly(shiftDate(today, -7)), lt: dateOnly(today) } } }),
  ]) : [null, 0];
  const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: businessTimezone(activeClient.responsePolicy), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const publishPending = calendarEnabled && !["PUBLISHED", "PUBLISHING"].includes(todaySlot?.status || "") && (!config.enabled || (!!config.publishTime && localTime >= config.publishTime));
  const stateFor = (slot: typeof slots[number]) => slot.status === "PLANNED" ? { ...STATUS.PLANNED, label: preparationLabel(slot.preparation) } : slot.status === "FAILED" ? STATUS.FAILED : slot.requiresApproval ? { label: slot.landingId ? "Por aprobar" : "En espera", style: "border-brass/30 bg-brass/10 text-brass" } : STATUS[slot.status];
  const failedSlots = slots.filter(slot => slot.status === "FAILED");
  const selectedState = selected ? stateFor(selected) : null;
  const selectedIssue = selected ? blogTaskError(selected.errorCode, selected.lastError, !!selected.landingId) : null;
  const selectedStats = selected?.landingId ? metrics.get(selected.landingId) : null;
  const selectedLiveUrl = selected?.landing?.publicPreviewUrl?.startsWith(`${blogBase}/`) ? selected.landing.publicPreviewUrl : selected?.landing?.contentCluster && blogBase ? `${blogBase}/guias/${selected.landing.contentCluster.slug}/${selected.landing.slug}/` : "";

  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6">
      {searchParams.firstUse === "content" ? <FirstUseHint goal="content" clientSlug={activeClient.slug} /> : null}
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-ink">Calendario del blog</h1>
          {calendarEnabled ? <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-ink/90">+ Nuevo artículo</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-96 max-w-[90vw] rounded-xl border border-ink/10 bg-paper p-4 shadow-lg">
              <p className="mb-3 text-xs text-slate">Elegí la fecha y, si querés, contá de qué tiene que tratar. Queda como borrador para revisar antes de publicar.</p>
              <GenerateDateForm competitors={priorityCompetitors} clientId={activeClient.id} day={nextFreeDay} minDate={tomorrow} clientSlug={activeClient.slug} language={preferences.language} comparison={preferences.comparisons} products={blogCatalog.products} globalExcluded={blogCatalog.excluded} balanced={balanced} neighbors={intentNeighbors} />
            </div>
          </details>
          <WeekPlanner competitors={priorityCompetitors} clientId={activeClient.id} products={blogCatalog.products} globalExcluded={blogCatalog.excluded} startDay={nextFreeDay} minDate={tomorrow} takenDays={[...takenDays]} language={preferences.language} comparisons={preferences.comparisons} balanced={balanced} neighbors={intentNeighbors} />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-semibold text-slate underline underline-offset-2 hover:text-ink">Días automáticos</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[85vw] rounded-xl border border-ink/10 bg-paper p-4 shadow-lg">
              <p className="text-xs text-slate">{lastPlanned ? `Planificado hasta el ${formatDay(lastPlanned)}. ` : ""}Se prepara un artículo por día, de a uno. Los días que ya tienen artículo no se tocan.</p>
              <form action={addBlogDays} className="mt-3 grid gap-3 text-sm">
                <input type="hidden" name="clientId" value={activeClient.id} />
                <label className="block font-medium text-ink">Desde
                  <input type="date" name="startDate" min={shiftDate(today, 1)} defaultValue={lastPlanned && lastPlanned >= today ? shiftDate(lastPlanned, 1) : shiftDate(today, 1)} className="mt-1 block w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
                </label>
                <label className="block font-medium text-ink">Cantidad de días
                  <select name="days" defaultValue="7" className="mt-1 block w-full rounded-lg border border-ink/15 bg-paper px-3 py-2">{[1, 2, 3, 5, 7, 10, 14, 21, 30].map(n => <option key={n} value={n}>{n} {n === 1 ? "día" : "días seguidos"}</option>)}</select>
                </label>
                <label className="block font-medium text-ink">Idioma de los artículos
                  <select name="language" defaultValue={blogPreferences(activeClient.responsePolicy).language} className="mt-1 block w-full rounded-lg border border-ink/15 bg-paper px-3 py-2">{BLOG_LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                </label>
                <label className="flex items-start gap-2 text-ink"><input type="hidden" name="comparisonOffered" value="1" /><input type="checkbox" name="comparison" defaultChecked={blogPreferences(activeClient.responsePolicy).comparisons} className="mt-1" /><span>Comparativas en los días de decisión</span></label>
                <PendingSubmitButton loadingText="Programando…" className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">Programar artículos</PendingSubmitButton>
              </form>
            </div>
          </details>
          </div> : <Link prefetch={false} href={`/geo?client=${encodeURIComponent(activeClient.slug)}&tab=seo`} className="text-xs font-semibold text-moss underline">Preparar artículos</Link>}
        </div>
        <p className="mt-2 text-xs text-slate">{config.enabled ? `Publicación diaria · ${config.publishTime || "sin horario"} (Argentina) · ${config.autoApprove ? "Aprobación automática" : "Aprobación manual"}` : "Publicación automática desactivada"} <Link prefetch={false} href={`/blog/configuracion?client=${encodeURIComponent(activeClient.slug)}`} className="ml-1 underline underline-offset-2">Configurar</Link></p>
        <p className="mt-1 truncate text-xs text-slate" title={upcoming?.landing?.titulo || undefined}>{config.enabled && upcoming ? <>Próximo: <Link prefetch={false} className="font-semibold text-ink underline underline-offset-2" href={calendarHref(activeClient.slug, upcoming.scheduledDate.toISOString().slice(0, 7), upcoming.scheduledDate.toISOString().slice(0, 10))}>{formatDay(upcoming.scheduledDate.toISOString().slice(0, 10))} · {upcoming.landing?.titulo || "Artículo preparado"}</Link></> : config.enabled ? "Todavía no hay un artículo listo para publicar." : "Seleccioná un día para consultar su artículo."}</p>
      </header>

      {calendarEnabled ? <Suspense fallback={<LoadingMessage className="mb-3 text-xs text-slate">Comprobando conexión…</LoadingMessage>}><AgentConnection client={activeClient.slug} /></Suspense> : null}
      {balanceNotes.length ? <div role="status" className="mb-3 rounded-lg border border-brass/25 bg-brass/5 px-3 py-2 text-xs text-ink"><p className="font-semibold">Equilibrio editorial</p>{balanceNotes.slice(0, 3).map(note => <p key={note}>{note}</p>)}</div> : null}
      {publishPending ? <p role="status" className="mb-3 rounded-lg border border-signal/20 bg-signal/5 px-3 py-2 text-xs text-ink">
        Hoy no se publicó ningún artículo. {todaySlot?.landingId && todaySlot.status !== "SKIPPED" ? (todaySlot.requiresApproval ? `El borrador «${todaySlot.landing?.titulo || "sin título"}» espera aprobación.` : `Hay uno listo: «${todaySlot.landing?.titulo || "sin título"}».`) : "No hay un artículo preparado para hoy."}{" "}
        <Link prefetch={false} className="font-semibold underline" href={calendarHref(activeClient.slug, today.slice(0, 7), today)}>Ver hoy</Link>
      </p> : null}
      {missedRecent ? <p role="status" className="mb-3 text-xs text-slate">{missedRecent} {missedRecent === 1 ? "artículo listo se omitió" : "artículos listos se omitieron"} en los últimos 7 días porque su fecha pasó. Podés reprogramarlos desde su día.</p> : null}
      {failedSlots.length ? <p className="mb-3 text-xs text-signal">{failedSlots.length} {failedSlots.length === 1 ? "artículo necesita" : "artículos necesitan"} revisión este mes. <Link prefetch={false} className="font-semibold underline" href={calendarHref(activeClient.slug, month, failedSlots[0].scheduledDate.toISOString().slice(0, 10))}>Ver detalle</Link></p> : null}
      {catalog?.status === "PARTIAL" ? <p className="mb-3 text-xs text-slate">Hay enlaces del catálogo para revisar. <Link prefetch={false} className="underline" href={`/blog/configuracion?client=${encodeURIComponent(activeClient.slug)}`}>Ver detalle</Link></p> : null}
      {rescheduledDate && requestedDate ? <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Artículo reprogramado para el {formatDay(rescheduledDate)}.{rescheduledDate !== requestedDate ? ` Es la primera fecha libre compatible desde el ${formatDay(requestedDate)}.` : ""}</p> : null}

      <section aria-label={monthLabel} className="overflow-hidden rounded-xl border border-ink/10 bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-3 py-3 sm:px-5">
          <h2 className="font-display text-lg capitalize text-ink sm:text-xl">{monthLabel}</h2>
          <div className="flex items-center gap-1.5">
            <Link prefetch={false} aria-label="Mes anterior" href={calendarHref(activeClient.slug, previous)} className="rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-ink/5">←</Link>
            <Link prefetch={false} href={calendarHref(activeClient.slug, today.slice(0, 7))} className="rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold hover:bg-ink/5">Hoy</Link>
            <Link prefetch={false} aria-label="Mes siguiente" href={calendarHref(activeClient.slug, next)} className="rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-ink/5">→</Link>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-ink/10 bg-ink/[0.025]">{WEEKDAYS.map(day => <div key={day} className="py-2 text-center text-[10px] font-semibold text-slate sm:px-3 sm:text-left sm:text-xs">{day}</div>)}</div>
        <div className="grid grid-cols-7">{calendarDays.map((day, index) => {
          const slot = day ? byDay.get(day) : null;
          const state = slot ? stateFor(slot) : null;
          const daySlots = slots.filter(item => item.scheduledDate.toISOString().slice(0, 10) === day);
          return day ? <Link prefetch={false} key={day} href={calendarHref(activeClient.slug, month, day)} scroll={false} data-calendar-day={day} aria-haspopup="dialog" aria-expanded={selectedDay === day} aria-label={`${formatDay(day)}: ${(slot && displayTitle(slot)) || (slot ? "Artículo en preparación" : "Sin artículo")}${state ? `, ${state.label}` : ""}`} title={(slot && displayTitle(slot)) || undefined} className={`flex min-h-28 min-w-0 flex-col border-b border-r border-ink/10 p-1.5 outline-offset-[-3px] hover:bg-ink/[0.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-moss sm:min-h-36 sm:p-3 ${day === today ? "bg-brass/[0.07]" : ""} ${selectedDay === day ? "ring-2 ring-inset ring-moss" : ""}`}>
            {daySlots.length > 1 ? <span className="mb-1 text-[10px] text-slate">{daySlots.length} temas</span> : null}<span className={`mb-2 inline-flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-[11px] font-semibold sm:text-xs ${day === today ? "bg-ink text-paper" : "text-slate"}`}>{Number(day.slice(-2))}</span>
            {slot ? <><p className="line-clamp-2 break-words text-[10px] font-semibold leading-snug text-ink sm:line-clamp-3 sm:text-xs">{displayTitle(slot) || (slot.status === "SKIPPED" ? "Sin publicación" : "Preparando artículo")}</p><PlanChips plan={dayPlanFrom(slot.preparation)} productName={productName} />{state ? <span className={`mt-2 flex max-w-full items-center gap-1 self-start`}><span className={`block min-w-0 truncate rounded border px-1 py-0.5 text-[9px] font-medium sm:px-1.5 sm:text-[10px] ${state.style}`}>{state.label}</span>{versionLanguages(slot.landingId).map(language => <span key={language} title={LANGUAGE_NAMES[language]} className="shrink-0 rounded bg-ink/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-ink sm:text-[10px]">{language}</span>)}</span> : null}</> : null}
          </Link> : <div key={`empty-${index}`} aria-hidden="true" className="min-h-28 border-b border-r border-ink/10 bg-ink/[0.015] sm:min-h-36" />;
        })}</div>
      </section>

      {selectedDay ? <CalendarDetail key={selectedDay} client={activeClient.slug} day={selectedDay} dateLabel={formatDay(selectedDay)} closeHref={calendarHref(activeClient.slug, month)} publicationId={selected?.id} publishing={selected?.status === "PUBLISHING"}>
        {selectedSlots.length > 1 ? <nav aria-label="Temas del día" className="flex flex-wrap gap-2">{selectedSlots.map((slot, index) => <Link key={slot.id} prefetch={false} href={`${calendarHref(activeClient.slug, month, selectedDay)}&publication=${encodeURIComponent(slot.id)}`} aria-current={slot.id === selected?.id ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-xs ${slot.id === selected?.id ? "bg-ink text-paper" : "border-ink/20 text-ink"}`}>Tema {index + 1}</Link>)}</nav> : null}
        {selected ? <>
          {selectedTranslations.length ? <nav aria-label="Versiones por idioma" className="flex flex-wrap gap-3">{selectedTranslations.map(article => <Link key={article.id} prefetch={false} className="text-sm font-semibold text-moss underline" href={`/blog/articulos/${article.id}?client=${encodeURIComponent(activeClient.slug)}`}>Editar {LANGUAGE_NAMES[article.language]}</Link>)}</nav> : null}
          {selected.lastError && selected.status !== "FAILED" ? <p role="alert" className="text-sm text-signal">{selected.lastError}</p> : null}
          {selectedState ? <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedState.style}`}>{selected.status === "PUBLISHING" ? <LoadingSpinner className="mr-1" /> : null}{selectedState.label}</span> : null}
          <h3 className="font-display text-2xl leading-tight text-ink">{selected.landing?.titulo || (selected.status === "SKIPPED" ? "Sin publicación" : "Preparando artículo")}</h3>
          {preparationBrief(selected.preparation) ? <p className="rounded-lg bg-ink/[0.04] px-3 py-2 text-sm text-ink"><span className="font-semibold">Consigna:</span> {preparationBrief(selected.preparation)}</p> : null}
          {selectedPlan.productId || selectedPlan.competitor || selectedPlan.excludedProductIds?.length ? <dl className="grid gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            {selectedPlan.productId ? <div className="flex gap-2"><dt className="shrink-0 font-semibold text-ink">Producto:</dt><dd className="min-w-0 text-ink">{productName.get(selectedPlan.productId) || selectedPlan.productId}</dd></div> : null}
            {selectedPlan.competitor ? <div className="flex gap-2"><dt className="shrink-0 font-semibold text-ink">Rival:</dt><dd className="min-w-0 text-ink">{selectedPlan.competitor}{selectedPlan.competitorNotes ? <span className="block text-xs text-slate">{selectedPlan.competitorNotes}</span> : null}</dd></div> : null}
            {selectedPlan.excludedProductIds?.length ? <div className="flex gap-2"><dt className="shrink-0 font-semibold text-ink">No nombrar:</dt><dd className="min-w-0 text-slate">{selectedPlan.excludedProductIds.map(id => productName.get(id) || id).join(" · ")}</dd></div> : null}
            {selectedPlan.competitor ? <p className="text-xs text-brass">Comparativa escrita por la IA: revisá los datos del rival antes de aprobarla.</p> : null}
          </dl> : null}
          {selected.status === "PLANNED" && !selected.landingId ? <PreparationStatus preparation={selected.preparation} backgroundTracking={calendarEnabled} /> : null}
          <p className="text-sm text-slate">{intentForSlot(selected) === "educational" ? "Artículo educativo" : "Artículo para ayudar a elegir"}{selected.landingId && languageOf.get(selected.landingId) ? ` · ${LANGUAGE_NAMES[languageOf.get(selected.landingId)!] || languageOf.get(selected.landingId)}` : ""}{selected.requiresApproval ? " · Pendiente de aprobación" : ""}</p>
          {selectedIssue ? <div role="alert" className="space-y-2 rounded-lg border border-signal/20 bg-signal/5 p-3 text-sm text-signal"><p className="font-semibold">{selectedIssue.message}</p><details><summary className="cursor-pointer">{selectedIssue.action === "detail" ? "Ver detalle" : "Detalle del error"}</summary><p className="mt-1 whitespace-pre-wrap break-words">{selected.lastError}</p></details>{selectedIssue.action === "edit" && selected.landingId ? <Link prefetch={false} href={`/blog/articulos/${selected.landingId}?${new URLSearchParams({ client: activeClient.slug, calendarMonth: month, calendarDay: selectedDay })}`} className="block font-semibold underline">Corregir artículo</Link> : selectedIssue.action === "connection" ? <Link prefetch={false} href={`/blog/configuracion?client=${encodeURIComponent(activeClient.slug)}`} className="block font-semibold underline">Revisar conexión</Link> : selectedIssue.action === "reschedule" ? <a href="#reprogramar" className="block font-semibold underline">Reprogramar</a> : null}</div> : null}
          {selected.landingId ? <div className="flex flex-wrap items-center gap-3">
            <ArticlePreviewButton articleId={selected.landingId} liveUrl={selected.status === "PUBLISHED" ? selectedLiveUrl || undefined : undefined} className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-ink" />
            <Link prefetch={false} href={`/blog/articulos/${selected.landingId}?${new URLSearchParams({ client: activeClient.slug, calendarMonth: month, calendarDay: selectedDay })}`} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">Editar artículo</Link>
            {selected.status !== "PUBLISHING" ? <DeleteLandingButton id={selected.landingId} className="rounded-lg border border-signal/50 px-3 py-2 text-sm font-semibold text-signal transition hover:bg-signal/10 disabled:cursor-wait disabled:opacity-60" /> : null}
          </div> : null}
          {selected.status === "PUBLISHED" && selectedLiveUrl ? <a href={selectedLiveUrl} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-moss underline">Ver artículo publicado ↗</a> : null}
          {selected.requiresApproval && selected.landingId ? <form action={approveAnalysisArticle}><input type="hidden" name="id" value={selected.id} /><PendingSubmitButton loadingText="Aprobando…" className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-paper">Aprobar borrador</PendingSubmitButton></form> : null}
          {selected.landingId && !selected.requiresApproval && selected.errorCode !== "QUALITY_BLOCKED" && selected.errorCode !== "DATE_INCOMPATIBLE" && ["READY", "FAILED", "PUBLISHING"].includes(selected.status) ? <PublishArticleButton key={`${selected.id}-${selected.status}-${selected.updatedAt.toISOString()}`} id={selected.id} publishing={selected.status === "PUBLISHING"} client={activeClient.slug} title={selected.landing?.titulo} retry={selectedIssue?.action === "retry-publication"} confirmMessage={selectedDay > today ? `Este artículo está programado para el ${formatDay(selectedDay)}. Al publicarlo pasará a hoy${byDay.get(today) && byDay.get(today)!.status !== "PUBLISHED" ? ` y el artículo de hoy${byDay.get(today)!.landing?.titulo ? ` («${byDay.get(today)!.landing!.titulo}»)` : ""} se moverá al próximo día libre` : ""}. ¿Continuar?` : undefined} /> : null}
          {selectedHistory.length ? <details className="text-xs text-slate"><summary className="cursor-pointer font-semibold">Historial de fechas</summary><ul className="mt-1 space-y-1">{selectedHistory.map((entry, index) => <li key={index}>{new Date(entry.at).toLocaleString("es-AR", { timeZone: businessTimezone(activeClient.responsePolicy), dateStyle: "short", timeStyle: "short" })} · {HISTORY_REASONS[entry.reason] || "Cambio de fecha"}: {formatDay(entry.from)} → {formatDay(entry.to)}</li>)}</ul></details> : null}
          {selected.status === "PUBLISHED" && (selected.preparation as any)?.publishedEarly ? <p className="rounded-lg bg-brass/10 px-3 py-2 text-xs text-ink">Publicado antes de fecha: estaba programado para el {formatDay((selected.preparation as any).publishedEarly.from)}{(selected.preparation as any).publishedEarly.displacedTo ? `; el artículo de hoy se movió al ${formatDay((selected.preparation as any).publishedEarly.displacedTo)}` : ""}.</p> : null}
          {selected.status === "PUBLISHED" && selected.needsDeploy && selected.errorCode === "DEPLOYMENT_FAILED" ? <PublishArticleButton id={selected.id} publishing={false} client={activeClient.slug} title={selected.landing?.titulo} retry revision /> : null}
          {selected.status === "PUBLISHED" ? <section className="space-y-3 border-t border-ink/10 pt-4">
            <h4 className="text-sm font-semibold">Resultados</h4>
            {selectedStats ? <p className="text-sm text-slate">{selectedStats.views} visitas · {selectedStats.clicks} clics · {selectedStats.leads} contactos</p> : null}
            {peerAverage !== null && selectedStats ? <p className="text-xs text-slate">Promedio de los demás artículos publicados: {peerAverage} visitas{selectedStats.views >= peerAverage ? " (este va igual o mejor)" : ""}.</p> : null}
            <p className="text-xs text-slate">{selected.landing?.indexingState === "INDEX" ? "Apto para indexación" : "Excluido de indexación"}{selected.needsDeploy ? " · Actualización pendiente" : ""}</p>
            {selected.landingId && referralStats.has(selected.landingId) ? <details className="text-xs text-slate"><summary className="cursor-pointer font-semibold">Procedencia de visitas</summary>{[...referralStats.get(selected.landingId)!].map(([label, n]) => <p key={label} className="mt-1">{label}: {n}</p>)}</details> : null}
          </section> : null}
          {selected.landingId && !["PUBLISHED", "PUBLISHING"].includes(selected.status) && (selectedDay > today || ["SKIPPED", "FAILED"].includes(selected.status) || selected.requiresApproval) ? <section id="reprogramar" className="space-y-3 border-t border-ink/10 pt-4"><h4 className="text-sm font-semibold">Reprogramar</h4><RescheduleForm id={selected.id} minDate={shiftDate(today, 1)} label="Reprogramar artículo" /></section> : null}
          {selectedDay > today && selected.landingId && !["PUBLISHED", "PUBLISHING"].includes(selected.status) ? <GenerationActionButton id={selected.id} day={selectedDay} client={activeClient.slug} label="Generar otro artículo" action={replaceBlogArticle} kind="replace" /> : null}
          {(selectedDay > today || selected.analysisRunId) && selected.status === "FAILED" && !selected.landingId ? <GenerationActionButton id={selected.id} day={selectedDay} client={activeClient.slug} label="Reintentar preparación" action={retryBlogPreparation} kind="retry" /> : null}
          {selectedDay > today && selected.status === "SKIPPED" && !selected.landingId ? <GenerationActionButton id={selected.id} day={selectedDay} client={activeClient.slug} label="Volver a planificar" action={restoreBlogDate} kind="restore" /> : null}
          {selectedDay > today && !["SKIPPED", "PUBLISHING", "PUBLISHED"].includes(selected.status) ? <form action={skipBlogDate} className="border-t border-ink/10 pt-4"><input type="hidden" name="id" value={selected.id} /><PendingSubmitButton loadingText="Omitiendo…" className="text-sm text-slate underline">Omitir fecha</PendingSubmitButton></form> : null}
        </> : <><h3 className="font-display text-xl">Sin artículo programado</h3>{selectedDay > today && calendarEnabled ? <GenerateDateForm competitors={priorityCompetitors} clientId={activeClient.id} day={selectedDay} language={preferences.language} comparison={balanced || editorialIntentForDate(selectedDay) === "decision" ? preferences.comparisons : undefined} products={blogCatalog.products} globalExcluded={blogCatalog.excluded} balanced={balanced} neighbors={intentNeighbors} /> : <p className="text-sm text-slate">No hay una publicación preparada para este día.</p>}</>}
      </CalendarDetail> : null}
    </main>
  );
}

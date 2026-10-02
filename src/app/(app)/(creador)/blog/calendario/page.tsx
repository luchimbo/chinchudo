import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { argentinaDate, monthBounds, shiftDate } from "@/lib/blog-calendar";
import { addBlogDays, replaceBlogArticle, rescheduleBlogArticle, restoreBlogDate, skipBlogDate, retryBlogPreparation } from "./actions";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";
import { blogReferral } from "@/lib/blog-referrals";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const STATUS: Record<string, { label: string; style: string }> = {
  PLANNED: { label: "Preparando", style: "border-amber-200 bg-amber-50 text-amber-800" },
  READY: { label: "Listo", style: "border-sky-200 bg-sky-50 text-sky-800" },
  PUBLISHING: { label: "Publicando", style: "border-violet-200 bg-violet-50 text-violet-800" },
  PUBLISHED: { label: "Publicado", style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  FAILED: { label: "Pendiente", style: "border-ink/10 bg-ink/5 text-slate" },
  SKIPPED: { label: "Omitido", style: "border-ink/10 bg-ink/5 text-slate" },
};

export default async function BlogCalendarPage({ searchParams }: { searchParams: { client?: string; month?: string } }) {
  const activeClient = await requirePageClient(prisma, searchParams.client);
  if (activeClient.slug !== "pcmidi") notFound();

  const today = argentinaDate();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.month || "") ? searchParams.month! : today.slice(0, 7);
  const { start, end } = monthBounds(month);
  const [slots, setting, client, lastSlot] = await Promise.all([
    prisma.blogPublication.findMany({
      where: { clientId: activeClient.id, scheduledDate: { gte: start, lt: end } },
      include: { landing: { select: { id: true, titulo: true, keyword: true, slug: true, indexingState: true, htmlContent: true, contentCluster: { select: { slug: true } } } } },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.appSetting.findUnique({ where: { key: `blog_daily_schedule:${activeClient.id}` }, select: { value: true } }),
    prisma.client.findUnique({ where: { id: activeClient.id }, select: { blogBaseUrl: true } }),
    prisma.blogPublication.findFirst({ where: { clientId: activeClient.id, status: { not: "SKIPPED" } }, orderBy: { scheduledDate: "desc" }, select: { scheduledDate: true } }),
  ]);
  let config: { enabled?: boolean; publishTime?: string } = {};
  try { config = JSON.parse(setting?.value || "{}"); } catch { /* Se muestra como apagado. */ }
  const lastPlanned = lastSlot ? lastSlot.scheduledDate.toISOString().slice(0, 10) : "";
  const formatDay = (day: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

  const landingIds = slots.flatMap((slot) => slot.landingId ? [slot.landingId] : []);
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
  const referrals = landingIds.length ? await prisma.trackingEvent.groupBy({ by: ["landingId", "referrer"], _count: { id: true }, where: { clientId: activeClient.id, landingId: { in: landingIds }, eventType: "page_view" } }) : [];
  const referralStats = new Map<string, Map<string, number>>();
  for (const row of referrals) {
    if (!row.landingId) continue;
    const entries = referralStats.get(row.landingId) || new Map<string, number>();
    const label = blogReferral(row.referrer);
    entries.set(label, (entries.get(label) || 0) + row._count.id);
    referralStats.set(row.landingId, entries);
  }

  const byDay = new Map(slots.map((slot) => [slot.scheduledDate.toISOString().slice(0, 10), slot]));
  const leading = (start.getUTCDay() + 6) % 7;
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const calendarDays = Array.from({ length: leading + daysInMonth }, (_, index) => index < leading ? "" : shiftDate(`${month}-01`, index - leading));
  while (calendarDays.length % 7) calendarDays.push("");
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const next = end.toISOString().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  const count = (status: string) => slots.filter((slot) => slot.status === status).length;
  const blogBase = (client?.blogBaseUrl || "https://blog.pcmidicenter.com").replace(/\/$/, "");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6">
      <header className="rounded-2xl bg-ink px-6 py-7 text-paper sm:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-paper/55">PC MIDI Center · Blog</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
          <div><h1 className="font-display text-3xl leading-tight sm:text-4xl">Calendario editorial</h1><p className="mt-2 max-w-2xl text-sm text-paper/65">Un artículo por día, preparado con anticipación y publicado a la hora que elijas.</p></div>
          <Link href="/blog/configuracion?client=pcmidi" className="rounded-full border border-paper/25 px-4 py-2 text-xs font-semibold text-paper hover:bg-paper/10">Configurar horario</Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-paper/10 px-3 py-1.5">{config.enabled ? `Activo · ${config.publishTime || "sin hora"} AR` : "Automatización apagada"}</span>
          <span className="rounded-full bg-sky-400/15 px-3 py-1.5 text-sky-100">{count("READY")} listos</span>
          <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-emerald-100">{count("PUBLISHED")} publicados</span>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-ink/10 bg-paper shadow-sm">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div><h2 className="font-display text-xl capitalize text-ink">{monthLabel}</h2><p className="text-xs text-slate">Los próximos 14 días se van completando con artículos listos para editar.</p></div>
          <div className="flex gap-2"><Link aria-label="Mes anterior" href={`/blog/calendario?client=pcmidi&month=${previous}`} className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm hover:bg-ink/5">←</Link><Link aria-label="Mes siguiente" href={`/blog/calendario?client=pcmidi&month=${next}`} className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm hover:bg-ink/5">→</Link></div>
        </div>
        <div className="overflow-x-auto"><div className="min-w-[840px]"><div className="grid grid-cols-7 border-b border-ink/10 bg-ink/[0.025]">{WEEKDAYS.map((day) => <div key={day} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate">{day}</div>)}</div>
          <div className="grid grid-cols-7">{calendarDays.map((day, index) => {
            const slot = day ? byDay.get(day) : null;
            const state = slot ? STATUS[slot.status] : null;
            const liveUrl = slot?.landing?.contentCluster ? `${blogBase}/guias/${slot.landing.contentCluster.slug}/${slot.landing.slug}/` : "";
            const stat = slot?.landingId ? metrics.get(slot.landingId) : null;
            return <div key={`${day || "blank"}-${index}`} className={`min-h-48 border-b border-r border-ink/10 p-2.5 ${day === today ? "bg-brass/[0.07]" : "bg-paper"}`}>
              {day ? <><div className="flex items-center justify-between"><span className={`text-xs font-bold ${day === today ? "rounded-full bg-ink px-2 py-1 text-paper" : "text-slate"}`}>{Number(day.slice(-2))}</span>{slot && state ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${state.style}`}>{state.label}</span> : null}</div>
                {slot ? <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-semibold text-slate">{editorialIntentForDate(day) === "educational" ? "Educativo" : "Ayuda a elegir"}</p>
                  <p className="line-clamp-3 text-xs font-semibold leading-snug text-ink">{slot.landing?.titulo || (slot.status === "SKIPPED" ? "Sin publicación" : "Buscando un tema útil")}</p>
                  {slot.landing?.keyword ? <p className="line-clamp-2 text-[11px] leading-snug text-slate">{slot.landing.keyword}</p> : null}
                  {slot.landingId && stat && slot.status === "PUBLISHED" ? <p className="text-[10px] text-slate">{stat.views} visitas · {stat.clicks} clics · {stat.leads} contactos</p> : null}
                  {slot.status === "PUBLISHED" ? <p className="text-[10px] text-moss">{slot.landing?.indexingState === "INDEX" ? "Apto para indexación" : "Excluido de indexación"}{slot.needsDeploy ? " · Despliegue pendiente" : ""}</p> : null}
                  {slot.landingId && referralStats.has(slot.landingId) && slot.status === "PUBLISHED" ? <details className="text-[10px] text-slate"><summary className="cursor-pointer">Procedencia de visitas</summary>{[...referralStats.get(slot.landingId)!].map(([label, n]) => <p key={label}>{label}: {n}</p>)}</details> : null}
                  {slot.landingId ? <Link href={`/blog/articulos/${slot.landingId}?client=pcmidi`} className="block text-[11px] font-semibold text-moss underline underline-offset-2">Editar artículo</Link> : null}
                  {slot.status === "PUBLISHED" && liveUrl ? <a href={liveUrl} target="_blank" rel="noreferrer" className="block text-[11px] font-semibold text-sky-700 underline underline-offset-2">Ver online ↗</a> : null}
                  {day <= today && ["SKIPPED", "FAILED"].includes(slot.status) && slot.landingId ? <form action={rescheduleBlogArticle} className="space-y-1 text-[11px]"><input type="hidden" name="id" value={slot.id} /><input type="date" name="scheduledDate" min={shiftDate(today, 1)} required className="w-full rounded border border-ink/15 px-1 py-1" /><button type="submit" className="font-semibold text-moss underline">Reprogramar artículo</button></form> : null}
                  {day > today && slot.landingId && !["PUBLISHED", "PUBLISHING"].includes(slot.status) ? <details className="text-[11px] text-slate"><summary className="cursor-pointer font-semibold">Mover o cambiar</summary><div className="mt-2 space-y-1.5"><form action={rescheduleBlogArticle} className="space-y-1"><input type="hidden" name="id" value={slot.id} /><input type="date" name="scheduledDate" min={shiftDate(today, 1)} required className="w-full rounded border border-ink/15 px-1 py-1" /><button type="submit" className="font-semibold text-moss underline">Mover</button></form><form action={replaceBlogArticle}><input type="hidden" name="id" value={slot.id} /><button type="submit" className="text-sky-700 underline">Generar otro artículo</button></form></div></details> : null}
                  {day > today && slot.status === "FAILED" && !slot.landingId ? <form action={retryBlogPreparation}><input type="hidden" name="id" value={slot.id} /><button type="submit" className="text-[11px] font-semibold text-moss underline">Reintentar preparación</button></form> : null}{day > today && slot.status === "SKIPPED" ? <form action={restoreBlogDate}><input type="hidden" name="id" value={slot.id} /><button type="submit" className="text-[11px] font-semibold text-moss underline">Volver a planificar</button></form> : null}
                  {day > today && !["SKIPPED", "PUBLISHING", "PUBLISHED"].includes(slot.status) ? <form action={skipBlogDate}><input type="hidden" name="id" value={slot.id} /><button type="submit" className="text-[10px] text-slate underline">Omitir fecha</button></form> : null}
                </div> : null}
              </> : null}
            </div>;
          })}</div></div></div>
      </section>

      <section className="mt-6 rounded-2xl border border-ink/10 bg-paper p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-xl text-ink">Crear más artículos</h2>
        <p className="mt-1 text-sm text-slate">{lastPlanned ? `Hay artículos planificados hasta el ${formatDay(lastPlanned)}. ` : ""}Sumá días después de esa fecha y se van escribiendo de a uno, como borradores privados.</p>
        <form action={addBlogDays} className="mt-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="clientId" value={activeClient.id} />
          <select name="days" defaultValue="7" aria-label="Cantidad de días" className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm">
            {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n === 1 ? "1 día más" : `${n} días más`}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">Crear artículos</button>
        </form>
      </section>
    </main>
  );
}

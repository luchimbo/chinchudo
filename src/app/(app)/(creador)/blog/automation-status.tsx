import { prisma } from "@/lib/db";
import { argentinaDate, dateOnly } from "@/lib/blog-calendar";
import { relayFetch } from "@/lib/relay-client";
import { PendingNavigationLink as Link } from "@/components/pending-navigation-link";

export async function BlogAutomationStatus({ clientId }: { clientId: string }) {
  const setting = await prisma.appSetting.findUnique({ where: { key: `blog_daily_schedule:${clientId}` } });
  let config: { enabled?: boolean; autoApprove?: boolean; publishTime?: string; firstPublishDate?: string } = {};
  try { config = JSON.parse(setting?.value || "{}"); } catch { /* Inactive until configured. */ }
  const today = argentinaDate();
  const start = config.firstPublishDate && config.firstPublishDate > today ? config.firstPublishDate : today;
  const [next, failures, drafts, catalog, connected] = await Promise.all([
    prisma.blogPublication.findFirst({ where: { clientId, scheduledDate: { gte: dateOnly(start) }, status: "READY", ...(config.autoApprove ? {} : { requiresApproval: false }) }, orderBy: { scheduledDate: "asc" }, include: { landing: { select: { titulo: true } } } }),
    prisma.blogPublication.findMany({ where: { clientId, status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, lastError: true, landingId: true } }),
    prisma.landing.count({ where: { clientId, status: "DRAFT" } }),
    prisma.catalogSyncRun.findFirst({ where: { clientId }, orderBy: { startedAt: "desc" }, select: { status: true } }),
    relayFetch("/health", { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.ok).catch(() => false),
  ]);
  return <section aria-label="Estado de la publicación diaria" className="mb-6 rounded-xl border border-ink/10 bg-paper p-5 text-sm text-slate">
    <p className="font-semibold text-ink">Publicación diaria: {config.enabled ? "activada" : "desactivada"}{config.enabled ? ` · ${config.publishTime || "sin hora configurada"} (Argentina)` : ""}</p>
    <p className="mt-1">{connected ? "Agente local conectado." : "Agente local sin conexión. La publicación necesita que esté encendido."} {config.autoApprove ? "Aprobación automática con controles de calidad." : "Aprobación manual."}</p>
    <p className="mt-2">{config.enabled && next ? `Próximo artículo: ${next.scheduledDate.toLocaleDateString("es-AR", { timeZone: "UTC" })} · ${next.landing?.titulo || "Sin título"}.` : config.enabled ? "Todavía no hay un artículo listo para la próxima publicación. Revisá el calendario." : "Activá la publicación diaria desde Configuración."}</p>
    <div className="mt-3 flex flex-wrap gap-4">
      <Link href="/blog/articulos?client=pcmidi&status=DRAFT" className="font-semibold text-moss underline">{drafts} borradores</Link>
      <Link href="/blog/calendario?client=pcmidi" className="font-semibold text-moss underline">Ver calendario</Link>
      <Link href="/blog/configuracion?client=pcmidi" className="font-semibold text-moss underline">Configuración</Link>
    </div>
    {catalog?.status === "PARTIAL" ? <p className="mt-3">La última sincronización del catálogo quedó parcial. Revisá el detalle en Configuración.</p> : null}
    {failures.length ? <ul className="mt-3 space-y-1 text-signal">{failures.map(row => <li key={row.id}>{row.landingId ? <Link className="underline" href={`/blog/articulos/${row.landingId}`}>Artículo bloqueado</Link> : "Preparación pendiente"}: {row.lastError || "Revisá el calendario."}</li>)}</ul> : null}
  </section>;
}

import type { PrismaClient } from "@prisma/client";

export type HealthAlert = {
  area: "cm" | "listening" | "blog";
  level: "error" | "warning";
  message: string;
  href: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function parse(value: string | undefined): Record<string, unknown> | null {
  try { const parsed = JSON.parse(value ?? ""); return parsed && typeof parsed === "object" ? parsed : null; } catch { return null; }
}

/**
 * Background work that silently stopped. Built only from what the workers
 * already write to Postgres, so it works on Vercel without reaching this PC.
 */
export async function loadSystemHealth(db: PrismaClient, clientId: string, now = new Date()): Promise<HealthAlert[]> {
  const [settings, latestOpportunity, blogPublications, failedPublications, listeningSources] = await Promise.all([
    db.appSetting.findMany({ where: { key: { in: ["cm.manual.worker.heartbeat", "cm.maintenance.last-run", "blog_runtime_relay_url"] } }, select: { key: true, value: true } }),
    db.opportunity.findFirst({ where: { clientId, channel: { name: "YouTube" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.blogPublication.count({ where: { clientId } }),
    db.blogPublication.count({ where: { clientId, status: "FAILED", updatedAt: { gte: new Date(now.getTime() - 72 * HOUR) } } }),
    db.monitoredSource.count({ where: { clientId, channel: "youtube", active: true } }),
  ]);
  const setting = (key: string) => settings.find((row) => row.key === key)?.value;
  const alerts: HealthAlert[] = [];

  const heartbeat = Date.parse(setting("cm.manual.worker.heartbeat") ?? "");
  if (!Number.isFinite(heartbeat) || now.getTime() - heartbeat > 2 * MINUTE) {
    alerts.push({ area: "cm", level: "error", href: "/asistente-cm",
      message: "El procesador de propuestas no está corriendo: «Generar» y «Rehacer» quedan en cola. Corre en el servidor pcmidi y en la PC de PC MIDI: revisá que alguno de los dos esté prendido." });
  }

  const maintenance = parse(setting("cm.maintenance.last-run"));
  const lastRun = Date.parse(String(maintenance?.at ?? ""));
  if (!Number.isFinite(lastRun) || now.getTime() - lastRun > HOUR) {
    alerts.push({ area: "cm", level: "warning", href: "/asistente-cm",
      message: "La actualización automática de propuestas no corre hace más de una hora." });
  } else {
    const attempted = Number(maintenance?.attempted) || 0;
    const errors = Number(maintenance?.errors) || 0;
    if (attempted >= 4 && errors / attempted > 0.5) {
      alerts.push({ area: "cm", level: "warning", href: "/asistente-cm",
        message: `La última actualización automática falló en ${errors} de ${attempted} propuestas.` });
    }
  }

  // Only clients that listen to YouTube can be expected to receive new comments.
  if (listeningSources > 0 && (!latestOpportunity || now.getTime() - latestOpportunity.createdAt.getTime() > 24 * HOUR)) {
    alerts.push({ area: "listening", level: "warning", href: "/monitoring",
      message: "No entraron oportunidades nuevas de YouTube en las últimas 24 horas. Revisá la escucha." });
  }

  if (blogPublications > 0) {
    if (!setting("blog_runtime_relay_url")?.trim()) {
      alerts.push({ area: "blog", level: "error", href: "/blog/calendario",
        message: "El trabajador del blog no está conectado: no se puede publicar ni ver vistas previas." });
    }
    if (failedPublications > 0) {
      alerts.push({ area: "blog", level: "warning", href: "/blog/calendario",
        message: `${failedPublications} ${failedPublications === 1 ? "artículo falló" : "artículos fallaron"} al publicarse en los últimos 3 días.` });
    }
  }

  return alerts;
}

export const SUPPORT_PATHS = ["/", "/asistente-cm", "/blog", "/blog/calendario", "/blog/configuracion", "/videos", "/tendencias", "/leads", "/analytics", "/geo", "/monitoring", "/configuracion", "/onboarding"] as const;
export const SUPPORT_MODULES = [
  { path: "/", label: "Inicio" },
  { path: "/asistente-cm", label: "Consultas y respuestas" },
  { path: "/blog", label: "Artículos del blog" },
  { path: "/blog/calendario", label: "Calendario del blog" },
  { path: "/blog/configuracion", label: "Configuración del blog" },
  { path: "/videos", label: "Tendencias y guiones" },
  { path: "/tendencias", label: "Tendencias" },
  { path: "/leads", label: "Contactos" },
  { path: "/analytics", label: "Resultados e informes" },
  { path: "/geo", label: "Visibilidad en inteligencia artificial" },
  { path: "/monitoring", label: "Redes y sitios monitoreados" },
  { path: "/configuracion", label: "Configuración" },
  { path: "/onboarding", label: "Configuración inicial" },
] satisfies Array<{ path: typeof SUPPORT_PATHS[number]; label: string }>;

export const ONBOARDING_LABELS: Record<string, string> = {
  NOT_STARTED: "Sin iniciar", ANALYZING: "Analizando", IN_REVIEW: "Por revisar", COMPLETED: "Completada",
};
export const TASK_LABELS: Record<string, string> = {
  QUEUED: "En cola", PROCESSING: "En proceso", RUNNING: "En proceso", COMPLETED: "Completada",
  FAILED: "Falló", PARTIAL: "Completada parcialmente", PENDING_DEPLOY: "Por actualizar en el sitio", DEPLOYING: "Actualizando el sitio",
  PLANNED: "Planificada", READY: "Lista", PUBLISHING: "Publicando", PUBLISHED: "Publicada", SKIPPED: "Omitida",
};
export type Tone = "ok" | "warning" | "danger" | "neutral";

const AUDIT_ACTIONS: Record<string, string> = {
  "client.activated": "Activó un cliente",
  "client.suspended": "Suspendió un cliente",
  "tenant_user.updated": "Cambió los datos o permisos de un usuario",
  "support_session.created": "Preparó un acceso al panel de un cliente",
  "support_session.exchanged": "Ingresó al panel de un cliente",
  "support_session.ended": "Finalizó un acceso al panel de un cliente",
  "support_session.revoked": "Quitó un acceso al panel de un cliente",
  "issue_report.resolved": "Marcó un problema como resuelto",
  "issue_report.reopened": "Volvió a abrir un problema",
  "platform_admin.register": "Habilitó una cuenta de administrador",
};
export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] || "Registró otro cambio administrativo";
}
export function taskTone(status: string): Tone {
  if (status === "FAILED") return "danger";
  if (["PARTIAL", "PENDING_DEPLOY"].includes(status)) return "warning";
  if (["COMPLETED", "PUBLISHED"].includes(status)) return "ok";
  return "neutral";
}

export function argentinaDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00-03:00`);
}

type Session = { revokedAt: Date | null; endedAt: Date | null; exchangedAt: Date | null; expiresAt: Date };
export function supportState(session: Session, now: Date): { label: string; tone: Tone; revocable: boolean } {
  if (session.revokedAt) return { label: "Acceso quitado", tone: "neutral", revocable: false };
  if (session.endedAt) return { label: "Finalizada", tone: "neutral", revocable: false };
  if (session.expiresAt <= now) return { label: "Vencida", tone: "neutral", revocable: false };
  return { label: session.exchangedAt ? "Activa" : "Pendiente de ingreso", tone: session.exchangedAt ? "ok" : "warning", revocable: true };
}

type Health = {
  description: string; userCount: number; onboarding: { status: string; analysisError: string } | null;
  sourceErrors: number; draftFailures: number; staleDrafts: number; blogFailures: number;
  catalogStatus?: string; businessStatus?: string; staleAnalysis: boolean;
};
export function clientAttention(input: Health): string[] {
  const alerts: string[] = [];
  if (!input.description.trim()) alerts.push("Completar descripción del negocio");
  if (!input.userCount) alerts.push("Sin usuarios asignados");
  if (input.onboarding && input.onboarding.status !== "COMPLETED") alerts.push("Revisar configuración inicial");
  if (input.onboarding?.analysisError) alerts.push("El análisis inicial registró un error");
  if (input.sourceErrors) alerts.push(`${input.sourceErrors} sitios o búsquedas con errores o bloqueos`);
  if (input.draftFailures) alerts.push(`No se pudieron preparar ${input.draftFailures} respuestas`);
  if (input.staleDrafts) alerts.push(`${input.staleDrafts} respuestas demoradas; revisar su preparación`);
  if (input.blogFailures) alerts.push(`No se pudieron publicar ${input.blogFailures} artículos del blog`);
  if (["FAILED", "PARTIAL", "PENDING_DEPLOY"].includes(input.catalogStatus || "")) alerts.push("Revisar la actualización de productos del catálogo");
  if (["FAILED", "PARTIAL"].includes(input.businessStatus || "")) alerts.push("Revisar último análisis del negocio");
  if (input.staleAnalysis) alerts.push("El análisis del negocio está demorado; necesita revisión");
  return alerts;
}

export function latestDate(dates: Array<Date | null | undefined>): Date | null {
  const known = dates.filter((date): date is Date => date instanceof Date);
  return known.length ? new Date(Math.max(...known.map(date => date.getTime()))) : null;
}

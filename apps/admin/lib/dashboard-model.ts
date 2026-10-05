export const SUPPORT_PATHS = ["/", "/asistente-cm", "/blog", "/blog/calendario", "/blog/configuracion", "/videos", "/tendencias", "/leads", "/analytics", "/geo", "/monitoring", "/configuracion", "/onboarding"] as const;
export const SUPPORT_MODULES = [
  { path: "/", label: "Inicio" },
  { path: "/asistente-cm", label: "Asistente CM" },
  { path: "/blog", label: "Artículos del blog" },
  { path: "/blog/calendario", label: "Calendario del blog" },
  { path: "/blog/configuracion", label: "Configuración del blog" },
  { path: "/videos", label: "Tendencias y guiones" },
  { path: "/tendencias", label: "Tendencias" },
  { path: "/leads", label: "Contactos" },
  { path: "/analytics", label: "Analítica e informe" },
  { path: "/geo", label: "Presencia en IAs" },
  { path: "/monitoring", label: "Fuentes de escucha" },
  { path: "/configuracion", label: "Configuración" },
  { path: "/onboarding", label: "Configuración inicial" },
] satisfies Array<{ path: typeof SUPPORT_PATHS[number]; label: string }>;

export const ONBOARDING_LABELS: Record<string, string> = {
  NOT_STARTED: "Sin iniciar", ANALYZING: "Analizando", IN_REVIEW: "Por revisar", COMPLETED: "Completada",
};
export const TASK_LABELS: Record<string, string> = {
  QUEUED: "En cola", PROCESSING: "En proceso", RUNNING: "En proceso", COMPLETED: "Completada",
  FAILED: "Falló", PARTIAL: "Revisión pendiente", PENDING_DEPLOY: "Pendiente de despliegue", DEPLOYING: "Desplegando",
  PLANNED: "Planificada", READY: "Lista", PUBLISHING: "Publicando", PUBLISHED: "Publicada", SKIPPED: "Omitida",
};
export type Tone = "ok" | "warning" | "danger" | "neutral";
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
  if (session.revokedAt) return { label: "Revocada", tone: "neutral", revocable: false };
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
  if (input.sourceErrors) alerts.push(`${input.sourceErrors} fuentes con errores o bloqueos`);
  if (input.draftFailures) alerts.push(`${input.draftFailures} tareas de borradores fallidas`);
  if (input.staleDrafts) alerts.push(`${input.staleDrafts} tareas de borradores con plazo vencido`);
  if (input.blogFailures) alerts.push(`${input.blogFailures} publicaciones del blog fallidas`);
  if (["FAILED", "PARTIAL", "PENDING_DEPLOY"].includes(input.catalogStatus || "")) alerts.push("Revisar última sincronización del catálogo");
  if (["FAILED", "PARTIAL"].includes(input.businessStatus || "")) alerts.push("Revisar último análisis del negocio");
  if (input.staleAnalysis) alerts.push("El análisis del negocio perdió su plazo de ejecución");
  return alerts;
}

export function latestDate(dates: Array<Date | null | undefined>): Date | null {
  const known = dates.filter((date): date is Date => date instanceof Date);
  return known.length ? new Date(Math.max(...known.map(date => date.getTime()))) : null;
}

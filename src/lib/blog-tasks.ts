import { preparationPhase } from "./blog-preparation-state.mjs";
import { publicationJob, type BlogPublicationJob } from "./blog-publications";
import { blogTaskError, type BlogTaskError } from "./blog-task-errors";

export type BlogTaskJob = BlogPublicationJob & {
  operation: "generation" | "publication";
  phase: string;
  day: string;
  landingId: string | null;
  requiresApproval: boolean;
  revision: boolean;
  issue: BlogTaskError | null;
};
export const BLOG_GENERATION_STARTED = "blog-generation-started";
export type GenerationStarted = { id: string; client: string; day: string; title?: string };
export function notifyGenerationStarted(job: GenerationStarted) {
  window.dispatchEvent(new CustomEvent<GenerationStarted>(BLOG_GENERATION_STARTED, { detail: job }));
}
export function taskIsTerminal(job: Pick<BlogTaskJob, "status">) { return ["READY", "PUBLISHED", "FAILED", "SKIPPED"].includes(job.status); }
export function preparationLabel(metadata: unknown) {
  const value = metadata as { deadlineAt?: string } | null;
  if (value?.deadlineAt && Date.parse(value.deadlineAt) <= Date.now()) return "En espera";
  return { GENERATING: "Generando", REVIEWING: "Revisando calidad", WAITING: "En espera" }[preparationPhase(metadata)];
}
export function taskJob(row: Parameters<typeof publicationJob>[0] & {
  scheduledDate: Date; preparation: unknown; errorCode: string; requiresApproval: boolean; landingId: string | null; plannedTitle: string;
}, blogBaseUrl: string): BlogTaskJob {
  const publication = publicationJob(row, blogBaseUrl);
  const operation = ["PUBLISHING", "PUBLISHED"].includes(row.status) || row.errorCode === "DEPLOYMENT_FAILED" || (row.status === "FAILED" && !!row.landingId && !row.preparation) ? "publication" : "generation";
  const blocked = row.errorCode === "QUALITY_BLOCKED" || (row.status === "READY" && !!row.lastError);
  const status = blocked ? "FAILED" : publication.status;
  const metadata = row.preparation as { deadlineAt?: string } | null;
  const stale = status === "PLANNED" && metadata?.deadlineAt && Date.parse(metadata.deadlineAt) <= Date.now();
  return { ...publication, title: row.landing?.titulo || row.plannedTitle || "Artículo del blog", status, operation, phase: status === "PLANNED" ? stale ? "WAITING" : preparationPhase(row.preparation) : status, day: row.scheduledDate.toISOString().slice(0, 10), landingId: row.landingId, requiresApproval: row.requiresApproval, revision: row.status === "PUBLISHED" && row.needsDeploy, issue: stale ? { code: "CONNECTION", message: "El agente no confirmó el resultado de la preparación.", action: "connection", label: "Revisar conexión" } : blogTaskError(row.errorCode, row.lastError, !!row.landingId) };
}

import type { Prisma } from "@prisma/client";

type RespondedAtSource = {
  contextAssessment: Prisma.JsonValue;
  updatedAt: Date;
  publishingLogs: { publishedAt: Date }[];
};

type SentText = { editedText: string; draftText: string };

function copilotRespondedAt(context: Prisma.JsonValue): Date | undefined {
  if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;
  const copilot = (context as Record<string, unknown>).copilot;
  if (!copilot || typeof copilot !== "object" || Array.isArray(copilot)) return undefined;
  const { respondedAt } = copilot as Record<string, unknown>;
  if (typeof respondedAt !== "string") return undefined;
  const date = new Date(respondedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Cuándo se respondió: la publicación registrada manda; si se respondió a mano desde el
 * Asistente CM (sin log), vale la marca del copiloto. Nunca la fecha en que se encontró.
 */
export function resolveRespondedAt(opportunity: RespondedAtSource): Date {
  const latestLog = opportunity.publishingLogs.reduce<Date | undefined>(
    (latest, log) => (!latest || log.publishedAt > latest ? log.publishedAt : latest),
    undefined,
  );
  return latestLog ?? copilotRespondedAt(opportunity.contextAssessment) ?? opportunity.updatedAt;
}

/** Más nuevas primero (o más viejas con "oldest"); desempata por id para paginar estable. */
export function sortByRespondedAt<T extends { id: string; respondedAt: Date }>(entries: T[], sort: "newest" | "oldest"): T[] {
  const direction = sort === "oldest" ? 1 : -1;
  return [...entries].sort((a, b) =>
    (a.respondedAt.getTime() - b.respondedAt.getTime()) * direction || a.id.localeCompare(b.id));
}

/**
 * Texto enviado: la respuesta que quedó en el log de publicación (en el flujo viejo no se marcaba
 * como primaria); si no hay log (respondida a mano desde el Asistente CM), la primaria.
 */
export function sentResponseText(logged: SentText | undefined, primary: SentText | undefined): string {
  const response = logged ?? primary;
  return response ? response.editedText || response.draftText : "";
}

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { cmManualInputHash } from "./cm-freshness";
import { refreshCMOpportunity, CM_ACTIVE_STATUSES, type CMChangeReason } from "./cm-maintenance";
import { ClientResolutionError } from "./auth";
import { loadCMVersion } from "./cm-version";

export const manualJobInput = z.object({
  client: z.string().min(1), opportunityId: z.string().min(1).max(100),
  action: z.enum(["generate", "regenerate"]), idempotencyKey: z.string().uuid(),
  responseId: z.string().max(100).optional(), productId: z.string().max(100).optional(),
  chatHistory: z.array(z.object({ sender: z.enum(["user", "assistant"]), text: z.string().max(20_000),
    suggestion: z.object({ text: z.string().max(20_000), original: z.string().max(20_000) }).optional() })).max(100).optional(),
});
const opportunitySelect = { id: true, clientId: true, status: true, sourceText: true, sourceTitle: true, channelId: true, detectedIntent: true, detectedBrandId: true, detectedProductId: true, contextAssessment: true, updatedAt: true,
  responses: { select: { id: true, updatedAt: true, publishingLog: { select: { id: true } } } } } satisfies Prisma.OpportunitySelect;
export async function enqueueManualJob(db: PrismaClient, clientId: string, requestedBy: string, input: z.infer<typeof manualJobInput>) {
  const existing = await db.cMManualJob.findUnique({ where: { clientId_idempotencyKey: { clientId, idempotencyKey: input.idempotencyKey } } });
  if (existing) {
    if (existing.opportunityId !== input.opportunityId || existing.action !== input.action) throw new ClientResolutionError("La solicitud ya se usó para otra operación.", 409);
    return existing;
  }
  const opportunity = await db.opportunity.findFirst({ where: { id: input.opportunityId, clientId }, select: opportunitySelect });
  if (!opportunity) throw new ClientResolutionError("Oportunidad no disponible.", 404);
  if (!CM_ACTIVE_STATUSES.includes(opportunity.status as typeof CM_ACTIVE_STATUSES[number]) || opportunity.responses.some(r => r.publishingLog)) throw new ClientResolutionError("La oportunidad ya no está abierta.", 409);
  if (input.responseId && !opportunity.responses.some(r => r.id === input.responseId)) throw new ClientResolutionError("La respuesta no corresponde a la oportunidad.", 400);
  if (input.productId && !await db.product.findFirst({ where: { id: input.productId, brand: { clientId } }, select: { id: true } })) throw new ClientResolutionError("El producto no pertenece al cliente.", 400);
  const contextVersion = await loadCMVersion(db, clientId);
  try {
    return await db.cMManualJob.create({ data: { clientId, requestedBy, opportunityId: opportunity.id,
      action: input.action, idempotencyKey: input.idempotencyKey,
      inputVersion: cmManualInputHash(opportunity),
      parameters: { contextVersion, ...(input.responseId ? { responseId: input.responseId } : {}),
        ...(input.productId !== undefined ? { productId: input.productId } : {}),
        ...(input.chatHistory ? { chatHistory: input.chatHistory } : {}) } } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const active = await db.cMManualJob.findFirst({ where: { clientId, opportunityId: opportunity.id, status: { in: ["QUEUED", "RUNNING"] } } });
      if (active) return active;
    }
    throw error;
  }
}
const errorCode = (error: unknown) => error && typeof error === "object" && "code" in error ? String(error.code) : "";
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const DATABASE_ERROR = /P2024|P2028|P2034|connection pool|database server|Can't reach database|write conflict|deadlock|pooler\.supabase/i;
const PROVIDER_ERROR = /timeout|timed out|ECONNRESET|ECONNREFUSED|fetch failed|\b429\b|\b50[234]\b/i;

export const transientJobError = (error: unknown) => {
  // Draft persistence is atomic. An expired transaction, a busy pool or a
  // serialization conflict can be retried by the bounded job loop; this path never publishes.
  return ["P2024", "P2028", "P2034"].includes(errorCode(error)) || DATABASE_ERROR.test(errorText(error)) || PROVIDER_ERROR.test(errorText(error));
};

/** What the operator sees in the assistant: the actual cause, not a generic message. */
export function describeJobError(error: unknown, retrying: boolean): string {
  const text = errorText(error);
  const again = retrying ? " Se vuelve a intentar." : " No se pudo completar tras varios intentos; volvé a pedir la propuesta.";
  if (["P2024", "P2028", "P2034"].includes(errorCode(error)) || DATABASE_ERROR.test(text)) return `La base de datos estaba ocupada.${again}`;
  if (PROVIDER_ERROR.test(text)) return `La IA no respondió a tiempo.${again}`;
  // Generation errors are written for the operator (external course, product
  // out of catalog, other client's data, no valid AI proposal).
  // Programming errors (TypeError, Prisma internals) stay in the logs.
  const own = text.trim().split("\n")[0];
  const plain = error instanceof Error && error.constructor === Error && !errorCode(error);
  if (plain && own && own.length <= 300 && !/^(Invalid|PrismaClient)/.test(own)) return own;
  return "No se pudo generar una propuesta segura. Se conserva el trabajo anterior.";
}

/** Global advisory lock serializes claims across worker processes; DB uniqueness protects tenants. */
export async function claimManualJob(db: PrismaClient, owner: string) {
  // Idle workers should not open a transaction and execute seven statements
  // every two seconds. The authoritative claim is still protected below.
  const waiting = await db.cMManualJob.findFirst({ where: { OR: [
    { status: "QUEUED", availableAt: { lte: new Date() } },
    { status: "RUNNING", leaseUntil: { lt: new Date() } },
  ] }, select: { id: true } });
  if (!waiting) return null;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(72810429)::text`;
    await tx.cMManualJob.updateMany({ where: { status: "RUNNING", leaseUntil: { lt: new Date() }, attempts: { gte: 3 } }, data: { status: "FAILED", leaseUntil: null, error: "Se agotaron los intentos al recuperar el procesador." } });
    await tx.cMManualJob.updateMany({ where: { status: "RUNNING", leaseUntil: { lt: new Date() }, attempts: { lt: 3 } }, data: { status: "QUEUED", lockedBy: "", leaseUntil: null } });
    if (await tx.cMManualJob.count({ where: { status: "RUNNING" } }) >= 2) return null;
    const running = await tx.cMManualJob.findMany({ where: { status: "RUNNING" }, select: { clientId: true } });
    const next = await tx.cMManualJob.findFirst({ where: { status: "QUEUED", availableAt: { lte: new Date() }, clientId: { notIn: running.map(j => j.clientId) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (!next) return null;
    return tx.cMManualJob.update({ where: { id: next.id }, data: { status: "RUNNING", lockedBy: owner, attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 120_000) } });
  }, { maxWait: 10_000, timeout: 15_000 });
}
/** Shown to the operator in the assistant (CMJobStatus) when a request is dropped or retried. */
const CHANGE_MESSAGES: Record<CMChangeReason, string> = {
  input_changed: "El comentario, su producto o su estado cambiaron mientras esperaba. Revisá la tarjeta y volvé a pedir la propuesta.",
  response_added: "Llegó otra propuesta para esta oportunidad mientras se generaba. Revisá la que está en la tarjeta.",
  rules_changed: "Cambiaron las reglas del cliente mientras se generaba; se vuelve a intentar con las actuales.",
  lease_lost: "El procesador perdió la reserva de esta oportunidad; se vuelve a intentar.",
  job_cancelled: "El pedido se canceló o venció mientras se generaba. Volvé a pedir la propuesta.",
};
const RETRYABLE_CHANGES = new Set<CMChangeReason>(["rules_changed", "lease_lost"]);

export async function runManualJob(db: PrismaClient, job: NonNullable<Awaited<ReturnType<typeof claimManualJob>>>, owner: string) {
  const heartbeat = setInterval(() => { void db.cMManualJob.updateMany({ where: { id: job.id, status: "RUNNING", lockedBy: owner }, data: { leaseUntil: new Date(Date.now() + 120_000) } }).catch(() => undefined); }, 20_000);
  console.info(JSON.stringify({ event: "performance", operation: "cm-generation", operationId: job.id, stage: "queue-wait", durationMs: Date.now() - job.createdAt.getTime(), ok: true }));
  try {
    const { contextVersion, ...parameters } = job.parameters as { contextVersion?: string; responseId?: string; productId?: string; chatHistory?: Prisma.JsonArray };
    let reason: CMChangeReason | undefined;
    const result = await refreshCMOpportunity(db, job.clientId, job.opportunityId, owner, { ...parameters, inputVersion: contextVersion, expectedHash: job.inputVersion, jobId: job.id }, (why) => { reason = why; });
    if (result === "busy") {
      await db.cMManualJob.updateMany({ where: { id: job.id, status: "RUNNING", lockedBy: owner }, data: { status: "QUEUED", attempts: { decrement: 1 }, availableAt: new Date(Date.now() + 2000), leaseUntil: null } });
    } else if (result === "changed" && reason && RETRYABLE_CHANGES.has(reason) && job.attempts < 2) {
      // The operator's request is still valid: the rules moved or the lease
      // expired mid-run. Run it again once with the current rules.
      const { contextVersion: _previous, ...rest } = job.parameters as Record<string, unknown>;
      await db.cMManualJob.updateMany({ where: { id: job.id, status: "RUNNING", lockedBy: owner }, data: { status: "QUEUED", parameters: rest as Prisma.InputJsonObject, availableAt: new Date(Date.now() + 1000), leaseUntil: null, error: CHANGE_MESSAGES[reason] } });
    } else if (!["generated", "review"].includes(result)) {
      await db.cMManualJob.updateMany({ where: { id: job.id, status: "RUNNING", lockedBy: owner }, data: { status: "CONFLICT", leaseUntil: null, error: reason ? CHANGE_MESSAGES[reason] : CHANGE_MESSAGES.input_changed } });
    }
  } catch (error) {
    const retry = transientJobError(error) && job.attempts < 3;
    await db.cMManualJob.updateMany({ where: { id: job.id, status: "RUNNING", lockedBy: owner }, data: {
      status: retry ? "QUEUED" : "FAILED", availableAt: new Date(Date.now() + job.attempts * 5000), leaseUntil: null,
      error: describeJobError(error, retry) } });
  } finally { clearInterval(heartbeat); }
}
export const workerOwner = () => randomUUID();

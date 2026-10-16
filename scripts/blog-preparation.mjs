import { randomUUID } from "node:crypto";

export { preparationPhase } from "../src/lib/blog-preparation-state.mjs";

export function newPreparation(now = new Date(), timeoutMs = 240_000) {
  return { phase: "GENERATING", attemptId: randomUUID(), startedAt: now.toISOString(), phaseUpdatedAt: now.toISOString(), deadlineAt: new Date(now.getTime() + timeoutMs + 60_000).toISOString() };
}

export async function setPreparationPhase(db, id, clientId, metadata, phase, now = new Date()) {
  if (!["GENERATING", "REVIEWING"].includes(phase)) return;
  return db.blogPublication.updateMany({
    where: { id, clientId, landingId: null, status: "PLANNED", preparation: { path: ["attemptId"], equals: metadata.attemptId } },
    data: { preparation: { ...metadata, phase, phaseUpdatedAt: now.toISOString() } },
  });
}

export async function failPreparation(db, id, clientId, metadata, error, now = new Date()) {
  return db.blogPublication.updateMany({
    where: { id, clientId, landingId: null, status: "PLANNED", preparation: { path: ["attemptId"], equals: metadata.attemptId } },
    data: { status: "FAILED", errorCode: "GENERATION_FAILED", lastError: String(error?.message || error).slice(-1000), preparation: { ...metadata, phase: "FAILED", finishedAt: now.toISOString() } },
  });
}

/** Solo se llama bajo la reserva del cliente; los intentos viejos nunca escriben sobre los nuevos. */
export async function recoverPreparations(db, clientId, now = new Date()) {
  const slots = await db.blogPublication.findMany({ where: { clientId, status: "PLANNED", landingId: null, OR: ["GENERATING", "REVIEWING"].map(phase => ({ preparation: { path: ["phase"], equals: phase } })) } });
  for (const slot of slots) {
    const metadata = slot.preparation;
    if (!metadata?.attemptId || !Number.isFinite(Date.parse(metadata.deadlineAt)) || Date.parse(metadata.deadlineAt) > now.getTime()) continue;
    const changed = await failPreparation(db, slot.id, clientId, metadata, "La preparación se interrumpió. Se puede reintentar.", now);
    if (changed?.count) await db.blogPublication.updateMany({ where: { id: slot.id, clientId, errorCode: "GENERATION_FAILED", preparation: { path: ["attemptId"], equals: metadata.attemptId } }, data: { errorCode: "GENERATION_INTERRUPTED" } });
  }
}

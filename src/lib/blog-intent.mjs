import { editorialIntentForDate } from "./blog-quality.mjs";

const INTENTS = ["educational", "decision"];
const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const dayOf = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

/** Intención elegida de forma explícita para el slot (guardada en `preparation`), si la hay. */
export function explicitIntent(preparation) {
  const value = asObject(preparation).editorialIntent;
  return INTENTS.includes(value) ? value : null;
}

/**
 * Intención editorial de un slot: la guardada en su plan o, si no tiene una, la que resulta de
 * la paridad de la fecha (el comportamiento histórico, que sigue valiendo para los slots viejos).
 */
export function intentForSlot(slot) {
  return explicitIntent(slot?.preparation) ?? editorialIntentForDate(dayOf(slot.scheduledDate));
}

/** Conserva la intención explícita al reescribir `preparation` (generación, reintentos, reemplazos). */
export function carryIntent(previous, next) {
  const intent = explicitIntent(previous);
  return intent ? { ...asObject(next), editorialIntent: intent } : next;
}

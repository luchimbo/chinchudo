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

// ── Cuota editorial (modo "balanced") ──────────────────────────────────────────────────
const WINDOW_DAYS = 14, SPAN_DAYS = 7, MAX_RUN = 2, MIN_PER_WINDOW = 5, MAX_PER_WINDOW = 9;
const LABELS = { educational: "educativos", decision: "para elegir" };
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const shiftDay = (day, offset) => new Date((dayNumber(day) + offset) * 86_400_000).toISOString().slice(0, 10);
const other = (intent) => intent === "decision" ? "educational" : "decision";

/** "balanced" reparte la intención por cuota; cualquier otro valor conserva la paridad de la fecha. */
export function intentModeOf(responsePolicy) {
  return asObject(asObject(responsePolicy).blog).intentMode === "balanced" ? "balanced" : "parity";
}

/** Mismo plan con la intención fijada (la que se guarda al elegirla, asignarla o mover el artículo). */
export function withIntent(preparation, intent) {
  return INTENTS.includes(intent) ? { ...asObject(preparation), editorialIntent: intent } : asObject(preparation);
}

/**
 * Intención de un día nuevo: la menos representada en ±7 días, sin pasar de 2 seguidas del mismo
 * tipo; si empatan se alterna respecto del día anterior. `neighbors` son `{ day, intent }`.
 */
export function assignIntent(day, neighbors) {
  const byDay = new Map(neighbors.filter((item) => item.day !== day).map((item) => [item.day, item.intent]));
  const run = (intent, step) => { let length = 0; while (byDay.get(shiftDay(day, step * (length + 1))) === intent) length += 1; return length; };
  const allowed = INTENTS.filter((intent) => run(intent, -1) + 1 + run(intent, 1) <= MAX_RUN);
  const near = [...byDay].filter(([other_day]) => Math.abs(dayNumber(other_day) - dayNumber(day)) <= SPAN_DAYS);
  const count = (intent) => near.filter(([, value]) => value === intent).length;
  const options = allowed.length ? allowed : INTENTS;
  if (options.length === 1) return options[0];
  if (count("educational") !== count("decision")) return count("educational") < count("decision") ? "educational" : "decision";
  const before = byDay.get(shiftDay(day, -1));
  return before ? other(before) : editorialIntentForDate(day);
}

/** Avisos de equilibrio (no bloquean): rachas largas y tandas de 14 días fuera de 5 a 9 por tipo. */
export function balanceWarnings(slots) {
  const byDay = new Map(slots.map((item) => [item.day, item.intent]));
  const days = [...byDay.keys()].sort();
  const warnings = [];
  for (const day of days) {
    if (byDay.has(shiftDay(day, -1)) && byDay.get(shiftDay(day, -1)) === byDay.get(day)) continue;
    let length = 1;
    while (byDay.get(shiftDay(day, length)) === byDay.get(day)) length += 1;
    if (length > MAX_RUN) { warnings.push(`Hay ${length} días seguidos de artículos ${LABELS[byDay.get(day)]} desde el ${day}.`); break; }
  }
  for (const day of days) {
    const window = Array.from({ length: WINDOW_DAYS }, (_, offset) => byDay.get(shiftDay(day, offset)));
    const known = window.filter(Boolean);
    const count = (intent) => known.filter((value) => value === intent).length;
    const complete = known.length === WINDOW_DAYS;
    const outside = INTENTS.find((intent) => count(intent) > MAX_PER_WINDOW || (complete && count(intent) < MIN_PER_WINDOW));
    if (outside) { warnings.push(`Del ${day} al ${shiftDay(day, WINDOW_DAYS - 1)} hay ${count("educational")} artículos educativos y ${count("decision")} para elegir (lo recomendado es entre ${MIN_PER_WINDOW} y ${MAX_PER_WINDOW} de cada tipo).`); break; }
  }
  return warnings;
}

/** Slots con artículo o plan alrededor de [from, to], con la intención de cada uno. */
export async function loadIntentNeighbors(db, clientId, from, to) {
  const rows = await db.blogPublication.findMany({ where: { clientId, scheduledDate: { gte: new Date(`${shiftDay(from, -SPAN_DAYS)}T00:00:00Z`), lte: new Date(`${shiftDay(to, SPAN_DAYS)}T00:00:00Z`) } }, select: { scheduledDate: true, status: true, landingId: true, preparation: true } });
  const slots = new Map();
  for (const row of rows) slots.set(dayOf(row.scheduledDate), { day: dayOf(row.scheduledDate), intent: intentForSlot(row), explicit: explicitIntent(row.preparation) !== null, status: row.status, landingId: row.landingId });
  return { slots, neighbors: [...slots.values()].filter((item) => item.status !== "SKIPPED").map(({ day, intent }) => ({ day, intent })) };
}

import { editorialIntentForDate } from "./blog-quality.mjs";

function shift(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Primer día libre desde `from` con la intención editorial pedida. La intención alterna día por
 * medio, así que ante un choque se avanza de a 2 días. `isTaken(day)` marca las fechas con
 * artículo propio; los espacios vacíos no cuentan como ocupados.
 */
export function nextFreeEditorialDay({ from, intent, isTaken, limit = 120 }) {
  let candidate = from;
  if (editorialIntentForDate(candidate) !== intent) candidate = shift(candidate, 1);
  for (let step = 0; isTaken(candidate); step += 1) {
    if (step >= limit) throw new Error("No hay un día libre compatible en los próximos meses.");
    candidate = shift(candidate, 2);
  }
  return candidate;
}

/** Agrega un movimiento de fecha al historial del slot (últimos 20), conservando el resto del plan. */
export function withDateHistory(preparation, entry, now = new Date()) {
  const base = preparation && typeof preparation === "object" && !Array.isArray(preparation) ? preparation : {};
  const history = Array.isArray(base.dateHistory) ? base.dateHistory.slice(-19) : [];
  return { ...base, dateHistory: [...history, { at: now.toISOString(), ...entry }] };
}

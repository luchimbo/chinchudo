import { argentinaDate, dateOnly, shiftDate } from "@/lib/blog-calendar";

export const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Lunes de la semana que contiene `day` (YYYY-MM-DD, hora Argentina). */
export function weekStart(day = argentinaDate()): string {
  const weekday = dateOnly(day).getUTCDay(); // 0 domingo … 6 sábado
  return shiftDate(day, weekday === 0 ? -6 : 1 - weekday);
}

/** Los 7 días de la semana, de lunes a domingo, y los límites para consultar. */
export function weekBounds(day = argentinaDate()) {
  const start = weekStart(day);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  return { start, end: days[6], days, startDate: dateOnly(start), endDate: dateOnly(days[6]) };
}

export function validWeekParam(value: string | null | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return weekStart(value);
    } catch {
      // fecha inválida: se usa la semana actual
    }
  }
  return weekStart();
}

export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(dateOnly(day));
}

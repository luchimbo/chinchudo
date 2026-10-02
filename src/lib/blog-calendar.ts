export const BLOG_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function argentinaDate(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BLOG_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Fecha inválida.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Fecha inválida.");
  return date;
}

export function shiftDate(value: string, days: number): string {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthBounds(month: string): { start: Date; end: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mes inválido.");
  const start = dateOnly(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

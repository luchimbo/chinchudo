import { dateOnly } from "./blog-calendar";

export function blogEntryDestination(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) value.forEach(entry => query.append(key, entry));
  }
  const path = query.has("status") ? "/blog/articulos" : "/blog/calendario";
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function calendarHref(client: string, month: string, day?: string) {
  const query = new URLSearchParams({ client, month });
  if (day) query.set("day", day);
  return `/blog/calendario?${query}`;
}

export function validCalendarDay(day: string | undefined, month: string): string | undefined {
  try { return day && dateOnly(day).toISOString().startsWith(month) ? day : undefined; } catch { return undefined; }
}

export function articleBackHref(client: string, scheduled: string | undefined, originMonth?: string, originDay?: string) {
  if (originMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(originMonth)) {
    const day = validCalendarDay(originDay, originMonth);
    if (day) return calendarHref(client, originMonth, day);
  }
  return scheduled ? calendarHref(client, scheduled.slice(0, 7), scheduled) : `/blog/articulos?client=${encodeURIComponent(client)}`;
}

import type { Tone } from "@/lib/dashboard-model";

const dateFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
export function Timestamp({ date }: { date?: Date | null }) {
  return date ? <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time> : <span>Sin actividad registrada</span>;
}
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function SectionHeading({ index, title, description, action }: { index: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><p className="eyebrow">{index} / Plataforma</p><h2>{title}</h2><p className="sans muted">{description}</p></div>{action}</div>;
}

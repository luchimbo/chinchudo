import Link from "next/link";
import { getVisibleClients } from "@/lib/auth";
import { prisma } from "@/lib/db";

type PageProps = { searchParams: { client?: string } };

const TREND_PLATFORMS = ["GOOGLE_TRENDS", "TWITTER", "TIKTOK_CREATIVE_CENTER", "TIKTOK_HASHTAG"];
const CONTEXT_PLATFORMS = ["GOOGLE_NEWS", "ARGENTINE_STREAMING_MEDIA", "ARGENTINE_PRESS", "ARGENTINA_DATA"];

function sourceLabel(signal: { platform: string; metadata: unknown }) {
  const metadata = signal.metadata && typeof signal.metadata === "object" ? signal.metadata as Record<string, unknown> : {};
  const outlet = typeof metadata.outlet === "string" ? metadata.outlet : "";
  if (outlet) return outlet;
  return ({
    GOOGLE_TRENDS: "Google Trends AR",
    TWITTER: "X / Trends24",
    GOOGLE_NEWS: "Google News AR",
    ARGENTINE_STREAMING_MEDIA: "Streaming argentino",
    ARGENTINE_PRESS: "Diarios argentinos",
    ARGENTINA_DATA: "ArgentinaDatos",
    TIKTOK_CREATIVE_CENTER: "TikTok Creative Center",
  } as Record<string, string>)[signal.platform] ?? signal.platform.replaceAll("_", " ");
}

function SignalCard({ signal, kind }: { signal: { id: string; title: string; description: string; sourceUrl: string; platform: string; createdAt: Date; metadata: unknown }; kind: "trend" | "context" }) {
  const label = kind === "trend" ? "Tendencia" : "Coyuntura";
  const age = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  const days = Math.round((signal.createdAt.getTime() - Date.now()) / 86_400_000);

  return (
    <article className="rounded-2xl border border-ink/10 bg-white/80 p-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${kind === "trend" ? "bg-brass/15 text-brass" : "bg-moss/12 text-moss"}`}>{label}</span>
        <span className="text-xs text-slate/60">{age.format(days, "day")}</span>
      </div>
      <h2 className="mt-3 font-display text-xl leading-tight text-ink">{signal.title.replace(/^(Coyuntura|Google Trend|X\/Twitter Trend):\s*/i, "")}</h2>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate">{signal.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink/8 pt-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate/55">{sourceLabel(signal)}</span>
        {signal.sourceUrl ? <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-ink underline decoration-ink/25 underline-offset-4 hover:text-moss">Ver fuente</a> : null}
      </div>
    </article>
  );
}

export default async function RadarPage({ searchParams }: PageProps) {
  const clients = await getVisibleClients(prisma);
  const client = clients.find((item) => item.slug === searchParams.client) ?? clients[0] ?? null;
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [trends, context] = client ? await Promise.all([
    prisma.trend.findMany({ where: { clientId: client.id, platform: { in: TREND_PLATFORMS }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.trend.findMany({ where: { clientId: client.id, platform: { in: CONTEXT_PLATFORMS }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]) : [[], []];
  const withClient = (href: string) => client ? `${href}?client=${encodeURIComponent(client.slug)}` : href;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <header className="border-b border-ink/10 pb-7">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brass">Radar editorial</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <div><h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Tendencias y coyuntura</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate">Senales para entender el contexto. No son instrucciones para subirse a cada tema: el Copiloto las usa solo cuando mejoran una respuesta.</p></div>
          <Link href={withClient("/copiloto")} className="rounded-full border border-ink/15 bg-white px-4 py-2.5 text-sm font-bold text-ink transition hover:border-ink/40">Volver al Copiloto</Link>
        </div>
      </header>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div><div className="flex items-baseline justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brass">Radar de tendencias</p><h2 className="mt-1 font-display text-2xl text-ink">De que se habla</h2></div><span className="text-sm font-bold text-slate/60">{trends.length}</span></div><p className="mt-2 text-sm leading-6 text-slate">Busquedas, hashtags y temas que estan ganando atencion.</p><div className="mt-4 grid gap-3">{trends.length ? trends.map((signal) => <SignalCard key={signal.id} signal={signal} kind="trend" />) : <div className="rounded-2xl border border-dashed border-ink/15 bg-white/55 p-7 text-sm leading-6 text-slate">Todavia no hay senales recientes para este cliente.</div>}</div></div>
        <div><div className="flex items-baseline justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">Radar de coyuntura</p><h2 className="mt-1 font-display text-2xl text-ink">Que paso y como tratarlo</h2></div><span className="text-sm font-bold text-slate/60">{context.length}</span></div><p className="mt-2 text-sm leading-6 text-slate">Noticias o hechos recientes. Requieren criterio editorial antes de cualquier guino.</p><div className="mt-4 grid gap-3">{context.length ? context.map((signal) => <SignalCard key={signal.id} signal={signal} kind="context" />) : <div className="rounded-2xl border border-dashed border-ink/15 bg-white/55 p-7 text-sm leading-6 text-slate">Todavia no hay coyuntura reciente para este cliente.</div>}</div></div>
      </section>
    </div>
  );
}

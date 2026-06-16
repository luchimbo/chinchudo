import Link from "next/link";
import { redirect } from "next/navigation";
import { getRelayUrl } from "@/lib/settings";

export const dynamic = "force-dynamic";

const NETWORKS = ["youtube", "instagram", "facebook", "x", "reddit"] as const;
const NETWORK_LABELS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X / Twitter",
  reddit: "Reddit",
};

type ChannelState = "ok" | "no" | "error";
type StatusData = {
  checked_at_utc?: string;
  accounts?: Record<string, { label: string; channels: Record<string, ChannelState>; error?: string }>;
  error?: string;
  empty?: boolean;
};

async function getStatus(): Promise<StatusData> {
  const url = await getRelayUrl();
  const token = process.env.AGENT_RELAY_TOKEN;
  if (!url || !token) return { error: "no_relay" };
  try {
    const r = await fetch(`${url.trim()}/login-status`, {
      headers: { Authorization: `Bearer ${token.trim()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 404) return { empty: true };
    if (!r.ok) return { error: `http_${r.status}` };
    return (await r.json()) as StatusData;
  } catch {
    return { error: "fetch_failed" };
  }
}

async function triggerCheck() {
  "use server";
  const url = await getRelayUrl();
  const token = process.env.AGENT_RELAY_TOKEN;
  if (url && token) {
    try {
      await fetch(`${url.trim()}/login-status/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // el chequeo corre en la PC; si falla el disparo, se reintenta manualmente
    }
  }
  redirect("/logins?started=1");
}

function Cell({ state }: { state?: ChannelState }) {
  if (state === "ok") return <span className="inline-block rounded-full bg-moss/15 px-2.5 py-1 text-xs font-bold text-moss">conectado</span>;
  if (state === "no") return <span className="inline-block rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600">sin login</span>;
  if (state === "error") return <span className="inline-block rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold text-ink/50">error</span>;
  return <span className="text-ink/30">—</span>;
}

export default async function LoginsPage({ searchParams }: { searchParams: { started?: string } }) {
  const data = await getStatus();
  const started = searchParams.started === "1";
  const accounts = data.accounts ? Object.entries(data.accounts) : [];
  const checkedAt = data.checked_at_utc ? new Date(data.checked_at_utc).toLocaleString("es-AR") : null;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-moss">PC MIDI Center</p>
          <h1 className="mt-3 font-display text-4xl leading-none text-ink md:text-5xl">Estado de logins</h1>
          <p className="mt-2 text-sm text-ink/60">Qué cuenta está logueada en qué red dentro del navegador de tu PC.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold text-ink/60 underline-offset-4 hover:underline">← Volver</Link>
          <form action={triggerCheck}>
            <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-paper transition hover:bg-ink/85">
              Revisar logins
            </button>
          </form>
        </div>
      </header>

      {started && (
        <div className="mb-5 rounded-lg border border-brass/40 bg-brass/10 px-4 py-3 text-sm text-ink">
          Chequeo iniciado en tu PC. Tarda ~3-4 minutos (abre cada perfil y cada red). Refrescá esta página cuando termine.
        </div>
      )}

      {data.error === "no_relay" && (
        <p className="rounded-lg border border-ink/10 bg-ink/5 px-4 py-6 text-sm text-ink/70">
          El relay no está configurado. Asegurate de que la PC esté con el acceso remoto activo.
        </p>
      )}
      {data.error === "fetch_failed" && (
        <p className="rounded-lg border border-ink/10 bg-ink/5 px-4 py-6 text-sm text-ink/70">
          No se pudo contactar al relay de tu PC. ¿Está prendida y con el túnel activo?
        </p>
      )}
      {data.empty && (
        <p className="rounded-lg border border-ink/10 bg-ink/5 px-4 py-6 text-sm text-ink/70">
          Todavía no hay datos. Tocá <strong>Revisar logins</strong> para correr el primer chequeo.
        </p>
      )}

      {accounts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-paper">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left">
                <th className="px-4 py-3 font-bold text-ink">Cuenta</th>
                {NETWORKS.map((n) => (
                  <th key={n} className="px-4 py-3 text-center font-bold text-ink">{NETWORK_LABELS[n]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map(([id, info]) => (
                <tr key={id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{info.label}</td>
                  {NETWORKS.map((n) => (
                    <td key={n} className="px-4 py-3 text-center"><Cell state={info.channels?.[n]} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {checkedAt && <p className="mt-4 text-xs text-ink/45">Último chequeo: {checkedAt}</p>}
    </main>
  );
}

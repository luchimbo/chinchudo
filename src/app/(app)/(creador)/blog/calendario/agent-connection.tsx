import { PendingNavigationLink as Link } from "@/components/pending-navigation-link";
import { relayFetch } from "@/lib/relay-client";

export async function AgentConnection({ client }: { client: string }) {
  const connected = await relayFetch("/health", { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.ok).catch(() => false);
  return connected ? null : <p role="status" className="mb-3 rounded-lg border border-brass/25 bg-brass/5 px-3 py-2 text-xs text-ink">El agente está sin conexión. La publicación necesita que esté encendido. <Link prefetch={false} className="underline" href={`/blog/configuracion?client=${encodeURIComponent(client)}`}>Ver configuración</Link></p>;
}

import { PendingNavigationLink as Link } from "@/components/pending-navigation-link";
import { relayFetch } from "@/lib/relay-client";

type CodeStatus = { loaded?: string; disk?: string; stale?: boolean; autoRestart?: boolean } | undefined;
type Health = { ok: boolean; blogCode?: CodeStatus };

async function health(path: string): Promise<Health | null> {
  try {
    const response = await relayFetch(path, { signal: AbortSignal.timeout(3_000), cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json().catch(() => ({}));
    return { ok: true, blogCode: body?.blogCode };
  } catch { return null; }
}

/** Avisos operativos: agente caído o procesos locales con código desactualizado. */
export function connectionIssues(relay: Health | null, runtime: Health | null): string[] {
  if (!relay) return ["El agente está sin conexión. La publicación necesita que esté encendido."];
  const issues: string[] = [];
  const processes: [string, Health | null][] = [["El agente (relay)", relay], ["El servicio de publicación y vistas previas", runtime]];
  // Un proceso desactualizado que se reinicia solo no necesita aviso: en un par de minutos carga el código nuevo.
  const reloading = (item: Health | null) => Boolean(item?.blogCode?.stale && item.blogCode.autoRestart);
  for (const [name, item] of processes) {
    if (!item) { if (name !== "El agente (relay)") issues.push(`${name} no responde.`); continue; }
    if (!item.blogCode) issues.push(`${name} corre una versión anterior sin control de versiones. Reinicialo.`);
    else if (item.blogCode.stale && !reloading(item)) issues.push(`${name} tiene cambios sin aplicar. Reinicialo para usar el código nuevo.`);
  }
  if (relay.blogCode && runtime?.blogCode && relay.blogCode.loaded !== runtime.blogCode.loaded && !reloading(relay) && !reloading(runtime)) issues.push("El agente y el servicio de publicación corren versiones distintas. Reiniciá el que quedó atrás.");
  return issues;
}

export async function AgentConnection({ client }: { client: string }) {
  const [relay, runtime] = await Promise.all([health("/health"), health("/blog/health")]);
  const issues = connectionIssues(relay, runtime);
  if (!issues.length) return null;
  return <div role="status" className="mb-3 space-y-1 rounded-lg border border-brass/25 bg-brass/5 px-3 py-2 text-xs text-ink">
    {issues.map(issue => <p key={issue}>{issue}</p>)}
    <Link prefetch={false} className="underline" href={`/blog/configuracion?client=${encodeURIComponent(client)}`}>Ver configuración</Link>
  </div>;
}

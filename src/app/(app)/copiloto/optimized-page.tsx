import Link from "next/link";
import { loadCMSummaries } from "@/lib/cm-summary-query";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { OPPORTUNITY_CHANNEL_NAMES } from "@/lib/opportunity-channels";
import { readCoverageSnapshot } from "@/lib/cm-coverage-snapshot";
import { operationTiming } from "@/lib/performance";
import { manualCMQueue } from "@/lib/performance-flags";
import { CopilotWorkspace } from "./workspace";

export default async function OptimizedCopilot({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const timing = operationTiming("cm-page");
  const client = await timing.measure("authentication", () => requirePageClient(prisma, searchParams.client));
  const [channels, brands, snapshot, youtube] = await timing.measure("filters", () => Promise.all([
    prisma.channel.findMany({ where: { name: { in: [...OPPORTUNITY_CHANNEL_NAMES] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { clientId: client.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    readCoverageSnapshot(prisma, client.id),
    prisma.youTubeConnection.findFirst({ where: { clientId: client.id }, orderBy: { updatedAt: "desc" }, select: { account: true, channelTitle: true } }),
  ]));
  const selectedBrand = brands.find(b => b.id === searchParams.brand)?.id ?? "";
  const selectedChannel = channels.find(c => c.id === searchParams.channel)?.id ?? "";
  const selectedResponse = ["generated", "missing", "stale", "fresh", "review", "error"].includes(searchParams.response || "") ? searchParams.response! : "";
  const selectedSort = ["newest", "oldest"].includes(searchParams.sort || "") ? searchParams.sort! : "";
  const pendingFilter = !!selectedResponse && selectedResponse !== "generated" && snapshot.pending;
  const page = Math.max(1, Math.min(100_000, Math.floor(Number(searchParams.page) || 1)));
  const rows = await timing.measure("list-query", () => loadCMSummaries(prisma, { clientId: client.id, brand: selectedBrand, channel: selectedChannel,
    response: selectedResponse, ids: pendingFilter ? [] : snapshot.rows.filter(row => row.status === selectedResponse).map(row => row.id), sort: selectedSort, page }));
  const href = (n: number) => { const q = new URLSearchParams(Object.entries(searchParams).filter((entry): entry is [string, string] => entry[1] !== undefined)); q.set("client", client.slug); q.set("page", String(n)); return `/asistente-cm?${q}`; };
  return <>
    <CopilotWorkspace optimized queueEnabled={manualCMQueue()} coveragePending={snapshot.pending} coverage={snapshot.counts}
      activeClient={{ slug: client.slug, name: client.name }} youtube={{ account: youtube?.account ?? "youtube-principal", connected: !!youtube, channelTitle: youtube?.channelTitle ?? "" }}
      filters={{ brands, channels, selectedBrand, selectedChannel, selectedResponse, selectedSort }} products={[]}
      opportunities={rows.slice(0, 20).map(row => { const summary = snapshot.rows.find(r => r.id === row.id); return { ...row, coverageRevision: summary?.revision || "", freshness: snapshot.pending ? "pending" : summary?.status || "missing", refreshError: summary?.error || "" }; })} />
    {pendingFilter ? <p className="mx-auto max-w-6xl p-5 text-sm" role="status">Actualizando el filtro de respuestas…</p> : null}
    <nav aria-label="Páginas de oportunidades" className="mx-auto flex max-w-6xl justify-between gap-5 p-5">{page > 1 ? <Link href={href(page - 1)}>← Anterior</Link> : <span />}<span>Página {page}</span>{rows.length > 20 ? <Link href={href(page + 1)}>Siguiente →</Link> : <span />}</nav>
  </>;
}

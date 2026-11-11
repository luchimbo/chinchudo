import { cmQueueCoverage, cmQueueResponse, cmQueueSort, loadCMSummaries } from "@/lib/cm-summary-query";
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
  const selectedResponse = cmQueueResponse(searchParams.response);
  const selectedSort = cmQueueSort(searchParams.sort);
  const pendingFilter = !!selectedResponse && selectedResponse !== "generated" && snapshot.pending;
  const coverageById = new Map(snapshot.rows.map(row => [row.id, row]));
  const queue = await timing.measure("list-query", () => loadCMSummaries(prisma, {
    clientId: client.id, brand: selectedBrand, channel: selectedChannel, response: selectedResponse,
    ...cmQueueCoverage(snapshot.rows, selectedResponse, snapshot.pending), sort: selectedSort,
    page: Number(searchParams.page), pageSize: 20, now: new Date(), focusId: searchParams.focus, compact: true,
  }));
  return <CopilotWorkspace optimized queueEnabled={manualCMQueue()} coveragePending={snapshot.pending} coverage={snapshot.counts}
    queuePage={{ page: queue.page, nextId: queue.nextId, focusId: queue.focusId, targetMissing: queue.targetMissing, pendingFilter }}
    activeClient={{ slug: client.slug, name: client.name }} youtube={{ account: youtube?.account ?? "youtube-principal", connected: !!youtube, channelTitle: youtube?.channelTitle ?? "" }}
    filters={{ brands, channels, selectedBrand, selectedChannel, selectedResponse, selectedSort }} products={[]}
    opportunities={queue.rows.flatMap(({ item, priorityReasons }) => {
      if (!item) return [];
      const summary = coverageById.get(item.id);
      return [{ ...item, priorityReasons, coverageRevision: summary?.revision || "",
        freshness: snapshot.pending ? "pending" : summary?.status || "missing", refreshError: summary?.error || "" }];
    })} />;
}

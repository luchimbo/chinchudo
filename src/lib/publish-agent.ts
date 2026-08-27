import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export type PublishResult =
  | { success: true; url: string }
  | { success: false; error: string; retryAfterSec?: number };

export async function checkPublishRateLimits(
  prisma: PrismaClient,
  account: string
): Promise<{ ok: true } | { ok: false; error: string; retryAfterSec?: number }> {
  if (!account) return { ok: true };

  const dailyCapRaw = await prisma.appSetting.findUnique({ where: { key: "PUBLISH_DAILY_PER_ACCOUNT" } });
  const spacingMinRaw = await prisma.appSetting.findUnique({ where: { key: "PUBLISH_MIN_SPACING_MIN" } });

  const dailyCap = parseInt(dailyCapRaw?.value ?? "8", 10);
  const spacingMin = parseInt(spacingMinRaw?.value ?? "10", 10);

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const dayCount = await prisma.publishingLog.count({
    where: { account, publishedAt: { gte: since } },
  });

  if (Number.isFinite(dailyCap) && dayCount >= dailyCap) {
    return { ok: false, error: "rate_limited_daily" };
  }

  const last = await prisma.publishingLog.findFirst({
    where: { account },
    orderBy: { publishedAt: "desc" },
  });

  if (last && Number.isFinite(spacingMin)) {
    const elapsedMin = (Date.now() - new Date(last.publishedAt).getTime()) / 60000;
    if (elapsedMin < spacingMin) {
      return {
        ok: false,
        error: "rate_limited_spacing",
        retryAfterSec: Math.ceil((spacingMin - elapsedMin) * 60),
      };
    }
  }

  return { ok: true };
}

export function runPublisher({
  channel,
  sourceUrl,
  text,
  account,
  dryRun = false,
}: {
  channel: string;
  sourceUrl: string;
  text: string;
  account: string;
  dryRun?: boolean;
}): PublishResult {
  const normalizedChannel = channel.toLowerCase();
  if (normalizedChannel === "youtube") {
    return { success: false, error: "official_youtube_api_required" };
  }
  if (normalizedChannel === "facebook" || normalizedChannel === "instagram") {
    return { success: false, error: "human_handoff_required" };
  }
  const pyArgs = [
    "agents/publisher.py",
    "--channel", channel,
    "--source-url", sourceUrl,
    "--text", text,
  ];
  if (account) pyArgs.push("--account", account);
  if (dryRun) pyArgs.push("--dry-run");

  try {
    const output = execFileSync("python", pyArgs, { encoding: "utf-8", cwd: process.cwd() });
    const result = JSON.parse(output.trim()) as Record<string, unknown>;
    if (result.success === true) {
      return { success: true, url: String(result.url || sourceUrl) };
    }
    return {
      success: false,
      error: String(result.error || "unknown"),
      ...(typeof result.retryAfterSec === "number" ? { retryAfterSec: result.retryAfterSec } : {}),
    };
  } catch (err: unknown) {
    const stdout = (err as { stdout?: string }).stdout ?? "";
    const msg = (err instanceof Error ? err.message : String(err)) + "\n" + stdout;
    const match = msg.match(/"error"\s*:\s*"([^"]+)"/);
    return { success: false, error: match ? match[1] : "publish_failed" };
  }
}

export function extractPostKey(channel: string, url: string): string | null {
  try {
    const ch = (channel || "").toLowerCase();
    if (ch === "youtube") {
      const v = new URL(url).searchParams.get("v");
      return v ? `v=${v}` : null;
    }
    if (ch === "reddit") {
      const m = url.match(/\/comments\/([a-z0-9]+)/i);
      return m ? `/comments/${m[1]}` : null;
    }
    if (ch === "instagram") {
      const m = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      return m ? `/${m[1]}/${m[2]}` : null;
    }
    if (ch === "facebook") {
      const m = url.match(/\/posts\/(\d+)/) || url.match(/\/permalink\/(\d+)/) || url.match(/[?&]story_fbid=(\d+)/);
      return m ? m[1] : null;
    }
    if (ch === "x" || ch === "twitter") {
      const m = url.match(/\/status\/(\d+)/);
      return m ? `/status/${m[1]}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function closeSiblingOpportunities(
  prisma: PrismaClient,
  opportunityId: string,
  channelId: string,
  sourceUrl: string,
  channelName: string
): Promise<number> {
  const postKey = extractPostKey(channelName, sourceUrl);
  if (!postKey) return 0;

  const result = await prisma.opportunity.updateMany({
    where: {
      id: { not: opportunityId },
      channelId,
      status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] },
      sourceUrl: { contains: postKey },
    },
    data: {
      status: "DISCARDED",
      notes: `Auto-descartada: ya se publicó un comentario en este post (${postKey}).`,
    },
  });

  return result.count;
}

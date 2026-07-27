import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export async function checkPublishRateLimits(prisma, account) {
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

export function runPublisher({ channel, sourceUrl, text, account, dryRun = false }) {
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
    const result = JSON.parse(output.trim());
    if (result.success === true) {
      return { success: true, url: result.url || sourceUrl };
    }
    return { success: false, error: result.error || "unknown" };
  } catch (err) {
    const stdout = err.stdout ?? "";
    const msg = (err.message || String(err)) + "\n" + stdout;
    const match = msg.match(/"error"\s*:\s*"([^"]+)"/);
    return { success: false, error: match ? match[1] : "publish_failed" };
  }
}

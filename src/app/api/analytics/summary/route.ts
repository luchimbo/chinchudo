import { NextResponse, type NextRequest } from "next/server";
import { ANALYTICS_PERIODS, getAnalyticsData, generateWeeklySummary, type AnalyticsPeriod } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit("analytics_summary", 5, 60_000);
  if (!rl.allowed) {
    await logger.warn("rate_limit", "analytics/summary bloqueado", { resetInMs: rl.resetInMs });
    return NextResponse.json(
      { error: `Límite alcanzado. Intentá en ${Math.ceil(rl.resetInMs / 1000)}s.` },
      { status: 429 }
    );
  }

  try {
    // Cliente activo opcional: si llega su slug, el resumen usa su key/modelo de OpenRouter.
    const clientSlug = new URL(request.url).searchParams.get("client")?.trim();
    const requestedPeriod = new URL(request.url).searchParams.get("period");
    const period: AnalyticsPeriod = ANALYTICS_PERIODS.includes(requestedPeriod as AnalyticsPeriod)
      ? requestedPeriod as AnalyticsPeriod
      : "30d";
    const client = clientSlug
      ? await prisma.client.findUnique({ where: { slug: clientSlug } })
      : null;

    const parseDate = (value: string | null, endOfDay = false) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
      const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };
    const data = await getAnalyticsData(client?.id, period, {
      from: parseDate(new URL(request.url).searchParams.get("from")),
      to: parseDate(new URL(request.url).searchParams.get("to"), true),
    });
    const summary = await generateWeeklySummary(data, {
      apiKey: client?.openrouterApiKey,
      model: client?.openrouterModel,
    });
    return NextResponse.json({ summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await logger.error("ai_error", "analytics/summary falló", { error: msg });
    return NextResponse.json({ error: "No se pudo generar el resumen. Intentá de nuevo en unos minutos." }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { ANALYTICS_PERIODS, getAnalyticsData, generateWeeklySummary, type AnalyticsPeriod } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { ClientResolutionError, getCurrentUser, resolveClientForSlug } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // La clave de rate limit es por sesión: antes era una constante global
  // compartida por toda la plataforma.
  const rl = await checkRateLimit(`analytics_summary:${user.username}`, 5, 60_000);
  if (!rl.allowed) {
    await logger.warn("rate_limit", "analytics/summary bloqueado", { resetInMs: rl.resetInMs });
    return NextResponse.json(
      { error: `Límite alcanzado. Intentá en ${Math.ceil(rl.resetInMs / 1000)}s.` },
      { status: 429 }
    );
  }

  try {
    // Cliente activo: siempre se resuelve contra la sesión, nunca por slug crudo.
    const clientSlug = new URL(request.url).searchParams.get("client")?.trim();
    const requestedPeriod = new URL(request.url).searchParams.get("period");
    const period: AnalyticsPeriod = ANALYTICS_PERIODS.includes(requestedPeriod as AnalyticsPeriod)
      ? requestedPeriod as AnalyticsPeriod
      : "30d";
    let client;
    try {
      client = await resolveClientForSlug(prisma, clientSlug);
    } catch (err) {
      if (err instanceof ClientResolutionError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

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

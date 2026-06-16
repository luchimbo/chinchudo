import { NextResponse } from "next/server";
import { getAnalyticsData, generateWeeklySummary } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST() {
  const rl = checkRateLimit("analytics_summary", 5, 60_000);
  if (!rl.allowed) {
    await logger.warn("rate_limit", "analytics/summary bloqueado", { resetInMs: rl.resetInMs });
    return NextResponse.json(
      { error: `Límite alcanzado. Intentá en ${Math.ceil(rl.resetInMs / 1000)}s.` },
      { status: 429 }
    );
  }

  try {
    const data    = await getAnalyticsData();
    const summary = await generateWeeklySummary(data);
    return NextResponse.json({ summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await logger.error("ai_error", "analytics/summary falló", { error: msg });
    return NextResponse.json({ error: "No se pudo generar el resumen. Intentá de nuevo en unos minutos." }, { status: 500 });
  }
}

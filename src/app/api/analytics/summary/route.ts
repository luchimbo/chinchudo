import { NextResponse, type NextRequest } from "next/server";
import { getAnalyticsData, generateWeeklySummary } from "@/lib/analytics";
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
    const client = clientSlug
      ? await prisma.client.findUnique({ where: { slug: clientSlug } })
      : null;

    const data    = await getAnalyticsData();
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

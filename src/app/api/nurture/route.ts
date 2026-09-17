import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processDueSteps } from "@/lib/nurture";

/**
 * Cron diario de nurturing: envía por SMTP los pasos vencidos de cada lead.
 * Vercel Cron autentica con `Authorization: Bearer <CRON_SECRET>`; también se
 * acepta NURTURE_CRON_SECRET para dispararlo a mano.
 */
export async function GET(req: NextRequest) {
  const secrets = [process.env.CRON_SECRET, process.env.NURTURE_CRON_SECRET].filter(Boolean);
  if (!secrets.length) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!secrets.some((secret) => auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await processDueSteps(prisma);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[api/nurture]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

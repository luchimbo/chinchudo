import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Cron endpoint de nurturing. Devuelve los pasos pendientes para que el proceso
 * Python los procese por SMTP. El envío real sigue en Python (mailer.py).
 * Autenticado con NURTURE_CRON_SECRET vía header Authorization: Bearer <secret>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.NURTURE_CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const steps = await prisma.nurtureStep.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: new Date() },
      },
      include: {
        lead: { select: { email: true, nombre: true, slug: true, keyword: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 50,
    });

    return NextResponse.json({ steps, count: steps.length });
  } catch (err) {
    console.error("[api/nurture]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

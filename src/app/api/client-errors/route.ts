import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientErrorReportSchema, buildClientErrorLog } from "@/lib/client-error-report";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 204 });

  const parsed = clientErrorReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Reporte inválido." }, { status: 400 });
  }

  const entry = buildClientErrorLog(parsed.data, user.username);
  await logger.error(entry.event, entry.message, entry.meta);

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

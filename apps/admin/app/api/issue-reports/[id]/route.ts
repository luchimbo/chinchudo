import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const schema = z.object({ status: z.enum(["OPEN", "RESOLVED"]) });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const identity = await requirePlatformAdmin();
  if (!identity) return NextResponse.json({ error: "Sesión de administrador requerida." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  try {
    await prisma.$transaction(async tx => {
      const previous = await tx.issueReport.findUniqueOrThrow({ where: { id: params.id }, select: { status: true } });
      if (previous.status === parsed.data.status) return;
      const updated = await tx.issueReport.updateMany({ where: { id: params.id, status: previous.status }, data: { status: parsed.data.status, resolvedAt: parsed.data.status === "RESOLVED" ? new Date() : null } });
      if (updated.count !== 1) return;
      await tx.adminAuditEvent.create({ data: {
        actorId: identity.profile.id, action: parsed.data.status === "RESOLVED" ? "issue_report.resolved" : "issue_report.reopened",
        targetType: "IssueReport", targetId: params.id, metadata: { previousStatus: previous.status, status: parsed.data.status },
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "", userAgent: request.headers.get("user-agent") || "",
      } });
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
    throw cause;
  }
}

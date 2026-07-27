import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  clientId: z.string().min(1),
});

function hashCode(code: string): string {
  const pepper = process.env.SUPPORT_EXCHANGE_PEPPER;
  if (!pepper) throw new Error("SUPPORT_EXCHANGE_PEPPER no configurado.");
  return createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

export async function POST(request: NextRequest) {
  const identity = await requirePlatformAdmin();
  if (!identity) return NextResponse.json({ error: "Sesion de administrador requerida." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

  const recentCount = await prisma.supportSession.count({
    where: {
      platformAdminId: identity.profile.id,
      createdAt: { gt: new Date(Date.now() - 60_000) },
    },
  });
  if (recentCount >= 5) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
  }

  const client = await prisma.client.findUnique({
    where: { id: parsed.data.clientId },
    select: { id: true, active: true },
  });
  if (!client?.active) return NextResponse.json({ error: "Cliente inactivo o inexistente." }, { status: 404 });

  const code = randomBytes(32).toString("base64url");
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = request.headers.get("user-agent") || "";
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.supportSession.create({
      data: {
        platformAdminId: identity.profile.id,
        clientId: client.id,
        reason: "Acceso administrativo directo",
        tokenHash: hashCode(code),
        expiresAt: new Date(Date.now() + 60_000),
        ipAddress,
        userAgent,
      },
    });
    await tx.adminAuditEvent.create({
      data: {
        actorId: identity.profile.id,
        clientId: client.id,
        supportSessionId: created.id,
        action: "support_session.created",
        targetType: "SupportSession",
        targetId: created.id,
        ipAddress,
        userAgent,
        metadata: { reason: "Acceso administrativo directo" },
      },
    });
    return created;
  });
  return NextResponse.json({
    sessionId: session.id,
    code,
    exchangeUrl: `${process.env.CLIENT_APP_URL || "http://localhost:3000"}/api/support/exchange`,
    expiresAt: session.expiresAt,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

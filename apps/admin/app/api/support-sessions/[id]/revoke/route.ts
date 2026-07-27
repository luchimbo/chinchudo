import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const identity = await requirePlatformAdmin();
  if (!identity) return NextResponse.json({ error: "Sesion de administrador requerida." }, { status: 401 });
  const issuedAt = Number(identity.claims.iat || 0) * 1000;
  if (!issuedAt || Date.now() - issuedAt > 10 * 60_000) {
    return NextResponse.json({ error: "Reautenticación MFA requerida." }, { status: 403 });
  }
  const session = await prisma.supportSession.findUnique({ where: { id: params.id } });
  if (!session) return NextResponse.json({ error: "Sesión inexistente." }, { status: 404 });
  await prisma.$transaction([
    prisma.supportSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    prisma.adminAuditEvent.create({
      data: {
        actorId: identity.profile.id,
        clientId: session.clientId,
        supportSessionId: session.id,
        action: "support_session.revoked",
        targetType: "SupportSession",
        targetId: session.id,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}

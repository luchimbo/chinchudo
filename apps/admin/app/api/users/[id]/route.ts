import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  role: z.enum(["admin", "operator"]),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const identity = await requirePlatformAdmin();
  if (!identity) return NextResponse.json({ error: "Sesion de administrador requerida." }, { status: 401 });
  const issuedAt = Number(identity.claims.iat || 0) * 1000;
  if (!issuedAt || Date.now() - issuedAt > 10 * 60_000) {
    return NextResponse.json({ error: "Reautenticación MFA requerida." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, clientId: true, email: true, name: true, role: true },
  });
  await prisma.adminAuditEvent.create({
    data: {
      actorId: identity.profile.id,
      clientId: updated.clientId,
      action: "tenant_user.updated",
      targetType: "User",
      targetId: updated.id,
      metadata: { role: updated.role },
    },
  });
  return NextResponse.json({ user: updated });
}

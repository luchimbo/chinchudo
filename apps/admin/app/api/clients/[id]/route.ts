import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const schema = z.object({ active: z.boolean() });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const identity = await requirePlatformAdmin();
  if (!identity) return NextResponse.json({ error: "Sesion de administrador requerida." }, { status: 401 });
  const issuedAt = Number(identity.claims.iat || 0) * 1000;
  if (!issuedAt || Date.now() - issuedAt > 10 * 60_000) {
    return NextResponse.json({ error: "Reautenticación MFA requerida." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  const updated = await prisma.client.update({
    where: { id: params.id },
    data: { active: parsed.data.active },
    select: { id: true, name: true, active: true },
  });
  await prisma.adminAuditEvent.create({
    data: {
      actorId: identity.profile.id,
      clientId: updated.id,
      action: updated.active ? "client.activated" : "client.suspended",
      targetType: "Client",
      targetId: updated.id,
    },
  });
  return NextResponse.json({ client: updated });
}

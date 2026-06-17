import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";

function validUnsubToken(email: string, token: string): boolean {
  const secret = process.env.NURTURE_UNSUBSCRIBE_SECRET ?? "";
  if (!secret || !token) return false;
  const expected = createHmac("sha256", secret).update(email).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

async function handleUnsubscribe(email: string, token: string) {
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  if (!validUnsubToken(email, token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 403 });
  }
  // Marcamos todos los nurture steps del lead como SKIPPED
  const leads = await prisma.lead.findMany({ where: { email } });
  const leadIds = leads.map((l) => l.id);
  if (leadIds.length > 0) {
    await prisma.nurtureStep.updateMany({
      where: { leadId: { in: leadIds }, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
  }
  await prisma.trackingEvent.create({
    data: { eventType: "unsubscribe", slug: "", meta: { email } },
  });
  return NextResponse.json({ success: true, message: "Desuscripto correctamente" });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  return handleUnsubscribe(searchParams.get("email") ?? "", searchParams.get("token") ?? "");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handleUnsubscribe(body.email ?? "", body.token ?? "");
}

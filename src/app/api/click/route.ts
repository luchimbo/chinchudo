import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";

// Hostname fijo de fallback para PC MIDI (cuando el lead no tiene clientId)
const FALLBACK_ALLOWED_HOST = "www.pcmidi.com.ar";

async function allowedHostForLead(leadId: string): Promise<string> {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId },
      select: { client: { select: { storeUrl: true } } },
    });
    const storeUrl = lead?.client?.storeUrl;
    if (storeUrl) {
      const parsed = new URL(storeUrl);
      return parsed.hostname;
    }
  } catch {
    // fall through
  }
  return FALLBACK_ALLOWED_HOST;
}

function validToken(leadId: string, slug: string, day: string, url: string, token: string, secret: string): boolean {
  if (!secret || !token) return false;
  const payload = `${leadId}|${slug}|${day}|${url}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const url = searchParams.get("url") ?? "";
  const leadId = searchParams.get("lead_id") ?? "";
  const slug = searchParams.get("slug") ?? "";
  const day = searchParams.get("day") ?? "";
  const token = searchParams.get("token") ?? "";

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  const allowedHost = await allowedHostForLead(leadId);
  if (urlObj.hostname !== allowedHost) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 });
  }

  // El secret puede venir del cliente o del env global
  let lead: { client?: { smtpPass?: string | null } | null } | null = null;
  try {
    lead = await prisma.lead.findFirst({ where: { id: leadId }, select: { client: { select: { smtpPass: true } } } });
  } catch { /* ignore */ }
  const secret =
    lead?.client?.smtpPass ||
    process.env.NURTURE_UNSUBSCRIBE_SECRET ||
    process.env.NURTURE_SMTP_PASS ||
    "";

  if (!validToken(leadId, slug, day, url, token, secret)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 403 });
  }

  try {
    await prisma.trackingEvent.create({
      data: {
        eventType: "email_click",
        slug,
        meta: { day, url, lead_id: leadId },
      },
    });
  } catch {
    // no bloqueamos el redirect si falla el tracking
  }

  return NextResponse.redirect(url);
}

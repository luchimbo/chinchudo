import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";

const ALLOWED_HOST = "www.pcmidi.com.ar";

function validToken(leadId: string, slug: string, day: string, url: string, token: string): boolean {
  const secret = process.env.NURTURE_UNSUBSCRIBE_SECRET ?? process.env.NURTURE_SMTP_PASS ?? "";
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

  if (urlObj.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 });
  }

  if (!validToken(leadId, slug, day, url, token)) {
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const EventSchema = z.object({
  event_type: z.string().min(1),
  slug: z.string().optional(),
  referrer: z.string().default(""),
  meta: z.record(z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = EventSchema.parse(body);

    const landing = data.slug
      ? await prisma.landing.findUnique({ where: { slug: data.slug } })
      : null;

    await prisma.trackingEvent.create({
      data: {
        eventType: data.event_type,
        slug: data.slug ?? "",
        referrer: data.referrer,
        meta: data.meta as object,
        landingId: landing?.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[api/events]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

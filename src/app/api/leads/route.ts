import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const LeadSchema = z.object({
  email: z.string().email(),
  nombre: z.string().default(""),
  slug: z.string().min(1),
  keyword: z.string().default(""),
  leadMagnetSlug: z.string().optional(),
  consent: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = LeadSchema.parse(body);

    let leadMagnetId: string | undefined;
    if (data.leadMagnetSlug) {
      const lm = await prisma.leadMagnet.findUnique({ where: { slug: data.leadMagnetSlug } });
      leadMagnetId = lm?.id;
    }

    const landing = await prisma.landing.findUnique({
      where: { slug: data.slug },
      select: { id: true, clientId: true },
    });

    const lead = await prisma.lead.create({
      data: {
        email: data.email,
        nombre: data.nombre,
        slug: data.slug,
        keyword: data.keyword,
        consent: data.consent,
        landingId: landing?.id,
        leadMagnetId,
        ...(landing?.clientId ? { clientId: landing.clientId } : {}),
      },
    });

    return NextResponse.json({ success: true, lead_id: lead.id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[api/leads]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

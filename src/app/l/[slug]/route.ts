import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderLandingHtml } from "@/lib/landing-html";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const landing = await prisma.landing.findUnique({
    where: { slug },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          slug: true,
          storeUrl: true,
          blogBaseUrl: true,
          labName: true,
          logoUrl: true,
          landingTemplate: true,
          landingPrimaryColor: true,
          landingSecondaryColor: true,
        },
      },
    },
  });

  if (!landing) {
    return new NextResponse("Landing no encontrada.", { status: 404 });
  }

  if (!landing.client) {
    return new NextResponse("La landing no tiene cliente asociado.", { status: 400 });
  }

  if (!["PREVIEW_ONLINE", "PUBLISHED"].includes(landing.status)) {
    return new NextResponse("Landing no disponible online.", { status: 404 });
  }

  try {
    const html = await renderLandingHtml(landing.client, landing.id);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(`No se pudo generar la landing pública.\n${message}`, { status: 500 });
  }
}

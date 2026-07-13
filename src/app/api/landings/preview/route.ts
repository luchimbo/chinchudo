import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { renderLandingHtml } from "@/lib/landing-html";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientSlug = url.searchParams.get("client")?.trim();
  const landingId = url.searchParams.get("landing")?.trim() || "";

  if (!clientSlug) {
    return new NextResponse("Falta client.", { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { slug: clientSlug },
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
  });

  if (!client) {
    return new NextResponse("Cliente no encontrado.", { status: 404 });
  }

  try {
    await assertClientAccess(prisma, client.id);
  } catch {
    return new NextResponse("Sin acceso al cliente.", { status: 403 });
  }

  try {
    const html = await renderLandingHtml(client, landingId);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(`No se pudo generar la preview.\n${message}`, { status: 500 });
  }
}

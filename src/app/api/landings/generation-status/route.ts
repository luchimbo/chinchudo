import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { relayFetch } from "@/lib/relay-client";

export async function GET(request: NextRequest) {
  const clientSlug = new URL(request.url).searchParams.get("client")?.trim();
  if (!clientSlug) return NextResponse.json({ error: "Falta client." }, { status: 400 });
  const client = await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  try { await assertClientAccess(prisma, client.id); const response = await relayFetch(`/landings/generation-status?client=${encodeURIComponent(clientSlug)}`); return NextResponse.json(await response.json(), { status: response.status }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar la generación." }, { status: 502 }); }
}

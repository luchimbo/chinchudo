import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { relayFetch } from "@/lib/relay-client";

export const runtime = "nodejs";

const schema = z.object({ clientSlug: z.string().min(1).max(100) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { slug: parsed.data.clientSlug }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  try {
    await assertClientAccess(prisma, client.id);
    const response = await relayFetch("/landings/generate", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo iniciar la generación." },
      { status: 502 },
    );
  }
}

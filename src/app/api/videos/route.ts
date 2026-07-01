import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, assertClientAccess } from "@/lib/auth";
import { generateVideoScript } from "@/lib/video-script-generator";
import { DIDService } from "@/lib/did-service";

/**
 * GET /api/videos
 * Lista tendencias y guiones filtrados por los clientes a los que el usuario tiene acceso.
 * O consulta el estado de renderizado de D-ID si se proporciona action=status e id.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const scriptId = searchParams.get("scriptId");

  // Caso 1: Consultar estado del video en D-ID
  if (action === "status" && scriptId) {
    try {
      const script = await prisma.videoScript.findUnique({
        where: { id: scriptId },
        include: { persona: true },
      });

      if (!script) {
        return NextResponse.json({ error: "Guion no encontrado" }, { status: 404 });
      }

      if (script.clientId) {
        await assertClientAccess(prisma, script.clientId);
      }

      if (!script.avatarJobId) {
        return NextResponse.json({ error: "El guion no tiene un Job ID de D-ID asociado" }, { status: 400 });
      }

      const talk = await DIDService.getTalkStatus(script.avatarJobId);

      // Si cambió el estado, actualizar la DB
      if (talk.status !== script.avatarStatus) {
        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarStatus: talk.status,
            avatarVideoUrl: talk.videoUrl || "",
            status: talk.status === "COMPLETED" ? "READY" : talk.status === "FAILED" ? "NEW" : "RENDERING",
          },
        });
      }

      return NextResponse.json({
        success: true,
        status: talk.status,
        videoUrl: talk.videoUrl,
        error: talk.error,
      });
    } catch (err: any) {
      console.error("[api/videos/status] Error:", err);
      return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
    }
  }

  // Caso 2: Listar tendencias y guiones
  try {
    const clientWhere = user.role !== "admin" && user.clientSlugs.length > 0
      ? { active: true, slug: { in: user.clientSlugs } }
      : { active: true };

    const clients = await prisma.client.findMany({ where: clientWhere, select: { id: true } });
    const clientIds = clients.map((c) => c.id);

    const trends = await prisma.trend.findMany({
      where: { clientId: { in: clientIds } },
      orderBy: { createdAt: "desc" },
    });

    const scripts = await prisma.videoScript.findMany({
      where: { clientId: { in: clientIds } },
      include: {
        product: { select: { name: true } },
        persona: { select: { name: true } },
        trend: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ trends, scripts });
  } catch (err: any) {
    console.error("[api/videos/list] Error:", err);
    return NextResponse.json({ error: "Error interno al listar" }, { status: 500 });
  }
}

/**
 * POST /api/videos
 * Maneja:
 * 1. Generación de guiones (action = "generate")
 * 2. Envío a renderizado de D-ID (action = "render")
 * 3. Creación de tendencia manual (action = "create_manual_trend")
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Acción A: Generar guion de video con IA
    if (action === "generate") {
      const { trendId, productId, personaId, clientId } = body;

      if (!trendId || !productId || !personaId || !clientId) {
        return NextResponse.json({ error: "Faltan parámetros obligatorios (trendId, productId, personaId, clientId)" }, { status: 400 });
      }

      await assertClientAccess(prisma, clientId);

      const scriptId = await generateVideoScript({
        trendId,
        productId,
        personaId,
        clientId,
      });

      if (!scriptId) {
        return NextResponse.json({ error: "No se pudo generar el guion de video" }, { status: 500 });
      }

      return NextResponse.json({ success: true, scriptId });
    }

    // Acción B: Renderizar guion a video D-ID
    if (action === "render") {
      const { scriptId } = body;

      if (!scriptId) {
        return NextResponse.json({ error: "Falta scriptId" }, { status: 400 });
      }

      const script = await prisma.videoScript.findUnique({
        where: { id: scriptId },
        include: { persona: true },
      });

      if (!script) {
        return NextResponse.json({ error: "Guion no encontrado" }, { status: 404 });
      }

      if (script.clientId) {
        await assertClientAccess(prisma, script.clientId);
      }

      // Concatenar el guion completo
      const fullText = `${script.hook}\n\n${script.bodyText}\n\n${script.cta}`;

      // Llamar a D-ID
      const talk = await DIDService.createTalk({
        scriptText: fullText,
        avatarUrl: script.persona.avatarUrl,
        personaName: script.persona.name,
      });

      if (talk.status === "FAILED") {
        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarStatus: "FAILED",
            status: "DISCARDED",
          },
        });
        return NextResponse.json({ error: talk.error || "La API de D-ID falló al iniciar" }, { status: 500 });
      }

      // Actualizar a estado renderizando
      await prisma.videoScript.update({
        where: { id: scriptId },
        data: {
          avatarJobId: talk.id,
          avatarStatus: talk.status,
          status: "RENDERING",
        },
      });

      return NextResponse.json({ success: true, jobId: talk.id });
    }

    // Acción C: Cargar tendencia manualmente (Radar Manual)
    if (action === "create_manual_trend") {
      const { title, description, sourceUrl, platform, clientId } = body;

      if (!title || !platform || !clientId) {
        return NextResponse.json({ error: "Faltan parámetros obligatorios" }, { status: 400 });
      }

      await assertClientAccess(prisma, clientId);

      const trend = await prisma.trend.create({
        data: {
          clientId,
          title,
          description: description || "",
          sourceUrl: sourceUrl || "",
          platform,
          queryUsed: "manual_upload",
          metadata: { manual: true },
        },
      });

      return NextResponse.json({ success: true, trendId: trend.id });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/videos/post] Error:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}

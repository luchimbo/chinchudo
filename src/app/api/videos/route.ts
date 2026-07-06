import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateVideoScript } from "@/lib/video-script-generator";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const clientWhere =
      user.role !== "admin" && user.clientSlugs.length > 0
        ? { active: true, slug: { in: user.clientSlugs } }
        : { active: true };

    const clients = await prisma.client.findMany({ where: clientWhere, select: { id: true } });
    const clientIds = clients.map((client) => client.id);

    const [trends, scripts] = await Promise.all([
      prisma.trend.findMany({
        where: { clientId: { in: clientIds } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.videoScript.findMany({
        where: { clientId: { in: clientIds } },
        include: {
          product: true,
          persona: true,
          trend: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ trends, scripts });
  } catch (err) {
    console.error("[api/videos/list] Error:", err);
    return NextResponse.json({ error: "Error interno al listar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      const { trendId, productId, personaId, clientId } = body;

      if (!trendId || !productId || !personaId || !clientId) {
        return NextResponse.json(
          { error: "Faltan parametros obligatorios (trendId, productId, personaId, clientId)" },
          { status: 400 },
        );
      }

      await assertClientAccess(prisma, clientId);

      const scriptId = await generateVideoScript({ trendId, productId, personaId, clientId });
      if (!scriptId) {
        return NextResponse.json({ error: "No se pudo generar el guion" }, { status: 500 });
      }

      return NextResponse.json({ success: true, scriptId });
    }

    if (action === "create_manual_trend") {
      const { title, description, sourceUrl, platform, clientId, metadata } = body;

      if (!title || !platform || !clientId) {
        return NextResponse.json({ error: "Faltan parametros obligatorios" }, { status: 400 });
      }

      await assertClientAccess(prisma, clientId);

      let finalDescription = description || "";
      const finalMetadata = { manual: true, ...(metadata || {}) };

      if (platform === "URL_ARTICLE" && sourceUrl) {
        try {
          const fetchRes = await fetch(sourceUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          if (fetchRes.ok) {
            const html = await fetchRes.text();
            const textOnly = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .substring(0, 4500);

            if (textOnly.length > 50) {
              finalDescription = textOnly;
              finalMetadata.scraped = true;
            }
          }
        } catch (fetchErr) {
          console.error("[api/videos/create_manual_trend] Error al leer URL:", fetchErr);
        }
      }

      const trend = await prisma.trend.create({
        data: {
          clientId,
          title,
          description: finalDescription,
          sourceUrl: sourceUrl || "",
          platform,
          queryUsed: "manual_upload",
          metadata: finalMetadata,
        },
      });

      return NextResponse.json({ success: true, trendId: trend.id });
    }

    if (action === "update_script") {
      const { scriptId, hook, bodyText, cta, visualCues, audioPrompt } = body;

      if (!scriptId) {
        return NextResponse.json({ error: "Falta scriptId" }, { status: 400 });
      }

      const script = await prisma.videoScript.findUnique({ where: { id: scriptId } });
      if (!script) {
        return NextResponse.json({ error: "Guion no encontrado" }, { status: 404 });
      }

      if (script.clientId) {
        await assertClientAccess(prisma, script.clientId);
      }

      const updated = await prisma.videoScript.update({
        where: { id: scriptId },
        data: {
          hook: hook || "",
          bodyText: bodyText || "",
          cta: cta || "",
          visualCues: visualCues || "",
          audioPrompt: audioPrompt || "",
        },
      });

      return NextResponse.json({ success: true, script: updated });
    }

    if (action === "render") {
      return NextResponse.json(
        { error: "El renderizador fue dado de baja. Este modulo ahora solo gestiona tendencias y guiones." },
        { status: 410 },
      );
    }

    return NextResponse.json({ error: "Accion no soportada" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/videos/post] Error:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}

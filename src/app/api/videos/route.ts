import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateVideoScript } from "@/lib/video-script-generator";
import { analyzeTrend, generateEditorialAngles } from "@/lib/content-idea-generator";
import type { ContentIdeaStatus, ContentIntent } from "@prisma/client";

const INTENTS = new Set<ContentIntent>(["SALE", "EDUCATION", "USE_CASE", "ENTERTAINMENT"]);
const IDEA_STATUSES = new Set<ContentIdeaStatus>(["REVIEW", "APPROVED", "SCRIPT_READY", "READY_TO_RECORD", "RECORDED", "PUBLISHED", "DISCARDED"]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const clientWhere = { active: true, slug: { in: user.clientSlugs } };

    const clients = await prisma.client.findMany({ where: clientWhere, select: { id: true } });
    const clientIds = clients.map((client) => client.id);

    const [trends, scripts, ideas] = await Promise.all([
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
      prisma.contentIdea.findMany({ where: { clientId: { in: clientIds } }, include: { product: { include: { brand: true } }, trend: { select: { title: true } }, videoScripts: { select: { id: true } } }, orderBy: { createdAt: "desc" } }),
    ]);

    return NextResponse.json({ trends, scripts, ideas });
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

    if (action === "generate_angles") {
      const { clientId, productId, intent } = body;
      if (!clientId || !productId || !INTENTS.has(intent)) return NextResponse.json({ error: "Producto e intención válidos son obligatorios." }, { status: 400 });
      await assertClientAccess(prisma, clientId);
      const product = await prisma.product.findFirst({ where: { id: productId, brand: { clientId } } });
      if (!product) return NextResponse.json({ error: "Producto no disponible para este cliente." }, { status: 404 });
      const angles = await generateEditorialAngles({ clientId, productId, intent });
      return NextResponse.json({ success: true, angles });
    }

    if (action === "create_idea") {
      const { clientId, productId, trendId, intent, format, hook, rationale, visualDirection, viabilityScore } = body;
      if (!clientId || !productId || !INTENTS.has(intent) || !format || !hook) return NextResponse.json({ error: "Faltan datos de la idea." }, { status: 400 });
      await assertClientAccess(prisma, clientId);
      const product = await prisma.product.findFirst({ where: { id: productId, brand: { clientId } } });
      if (!product) return NextResponse.json({ error: "Producto no disponible para este cliente." }, { status: 404 });
      const trend = trendId ? await prisma.trend.findFirst({ where: { id: trendId, clientId } }) : null;
      const idea = await prisma.contentIdea.create({ data: { clientId, productId, trendId: trend?.id, intent, format, hook, rationale: rationale || "", visualDirection: visualDirection || "", viabilityScore: Math.max(1, Math.min(5, Number(viabilityScore) || 3)), status: "APPROVED" } });
      return NextResponse.json({ success: true, idea });
    }

    if (action === "generate_script_from_idea") {
      const { clientId, contentIdeaId, personaId } = body;
      if (!clientId || !contentIdeaId || !personaId) return NextResponse.json({ error: "Faltan datos para generar el guion." }, { status: 400 });
      await assertClientAccess(prisma, clientId);
      const idea = await prisma.contentIdea.findFirst({ where: { id: contentIdeaId, clientId } });
      if (!idea || idea.status !== "APPROVED") return NextResponse.json({ error: "La idea debe estar aprobada antes de generar el guion." }, { status: 409 });
      const persona = await prisma.persona.findFirst({ where: { id: personaId, clientId } });
      if (!persona) return NextResponse.json({ error: "Persona no disponible para este cliente." }, { status: 404 });
      const scriptId = await generateVideoScript({ contentIdeaId, personaId, clientId });
      if (!scriptId) return NextResponse.json({ error: "No se pudo generar el guion." }, { status: 500 });
      await prisma.contentIdea.update({ where: { id: contentIdeaId }, data: { status: "SCRIPT_READY" } });
      return NextResponse.json({ success: true, scriptId });
    }

    if (action === "update_idea_status") {
      const { clientId, ideaId, status } = body;
      if (!clientId || !ideaId || !IDEA_STATUSES.has(status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
      await assertClientAccess(prisma, clientId);
      const idea = await prisma.contentIdea.findFirst({ where: { id: ideaId, clientId } });
      if (!idea) return NextResponse.json({ error: "Idea no encontrada." }, { status: 404 });
      return NextResponse.json({ success: true, idea: await prisma.contentIdea.update({ where: { id: ideaId }, data: { status } }) });
    }

    if (action === "analyze_trend") {
      const { clientId, trendId } = body;
      await assertClientAccess(prisma, clientId);
      const trend = await prisma.trend.findFirst({ where: { id: trendId, clientId } });
      if (!trend) return NextResponse.json({ error: "Referencia no encontrada." }, { status: 404 });
      await analyzeTrend(trendId);
      return NextResponse.json({ success: true });
    }

    if (action === "generate") {
      return NextResponse.json(
        { error: "Los guiones ahora se generan desde una idea aprobada." },
        { status: 410 },
      );
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

      void analyzeTrend(trend.id);

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

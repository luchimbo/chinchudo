import { NextRequest, NextResponse } from "next/server";
import type { Persona, Product, VideoScript } from "@prisma/client";
import { assertClientAccess, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DIDService } from "@/lib/did-service";
import { FFmpegComposer } from "@/lib/ffmpeg-composer";
import { LocalAvatarRenderer } from "@/lib/local-avatar-renderer";
import { generateVideoScript } from "@/lib/video-script-generator";

type RenderableScript = VideoScript & {
  persona: Persona;
  product: Product | null;
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const scriptId = searchParams.get("scriptId");

  if (action === "status" && scriptId) {
    try {
      const script = await prisma.videoScript.findUnique({
        where: { id: scriptId },
        include: { persona: true, product: true },
      });

      if (!script) {
        return NextResponse.json({ error: "Guion no encontrado" }, { status: 404 });
      }

      if (script.clientId) {
        await assertClientAccess(prisma, script.clientId);
      }

      if (script.status === "READY") {
        return NextResponse.json({
          success: true,
          status: "COMPLETED",
          videoUrl: script.avatarVideoUrl,
        });
      }

      if (script.status === "COMPOSING") {
        return NextResponse.json({ success: true, status: "COMPOSING", videoUrl: null });
      }

      if (script.status === "FAILED") {
        return NextResponse.json({
          success: true,
          status: "FAILED",
          videoUrl: null,
          error: "El renderizado falló.",
        });
      }

      if (script.avatarJobId.startsWith("local_")) {
        return NextResponse.json({
          success: true,
          status: script.status === "RENDERING" ? "PROCESSING" : script.status,
          videoUrl: null,
        });
      }

      if (!script.avatarJobId) {
        return NextResponse.json({ error: "El guion no tiene un Job ID asociado" }, { status: 400 });
      }

      const talk = await DIDService.getTalkStatus(script.avatarJobId);

      if (talk.status === "COMPLETED" && talk.videoUrl) {
        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarStatus: "COMPLETED",
            status: "COMPOSING",
          },
        });

        composeFinalVideoInBackground({
          scriptId,
          script,
          avatarVideoUrl: talk.videoUrl,
          fallbackVideoUrl: talk.videoUrl,
        }).catch((err) => {
          console.error(`[api/videos/status] D-ID composition failed for ${scriptId}:`, err);
        });

        return NextResponse.json({ success: true, status: "COMPOSING", videoUrl: null });
      }

      if (talk.status === "FAILED") {
        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarStatus: "FAILED",
            status: "FAILED",
          },
        });
      } else if (talk.status !== script.avatarStatus) {
        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarStatus: talk.status,
            status: "RENDERING",
          },
        });
      }

      return NextResponse.json({
        success: true,
        status: talk.status,
        videoUrl: null,
        error: talk.error,
      });
    } catch (err: any) {
      console.error("[api/videos/status] Error:", err);
      return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
    }
  }

  try {
    const clientWhere =
      user.role !== "admin" && user.clientSlugs.length > 0
        ? { active: true, slug: { in: user.clientSlugs } }
        : { active: true };

    const clients = await prisma.client.findMany({ where: clientWhere, select: { id: true } });
    const clientIds = clients.map((client) => client.id);

    const trends = await prisma.trend.findMany({
      where: { clientId: { in: clientIds } },
      orderBy: { createdAt: "desc" },
    });

    const scripts = await prisma.videoScript.findMany({
      where: { clientId: { in: clientIds } },
      include: {
        product: true,
        persona: true,
        trend: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

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
          { error: "Faltan parámetros obligatorios (trendId, productId, personaId, clientId)" },
          { status: 400 },
        );
      }

      await assertClientAccess(prisma, clientId);

      const scriptId = await generateVideoScript({ trendId, productId, personaId, clientId });
      if (!scriptId) {
        return NextResponse.json({ error: "No se pudo generar el guion de video" }, { status: 500 });
      }

      return NextResponse.json({ success: true, scriptId });
    }

    if (action === "render") {
      const {
        scriptId,
        avatarUrl,
        voiceId,
        voiceStyle,
        bgType,
        bgColor,
        stitch,
        rate,
        pitch,
        pauseDuration,
        styleDegree,
        padAudio,
        elevenLabsVoiceId,
        expressionHook,
        expressionBody,
        expressionCta,
      } = body;

      if (!scriptId) {
        return NextResponse.json({ error: "Falta scriptId" }, { status: 400 });
      }

      const script = await prisma.videoScript.findUnique({
        where: { id: scriptId },
        include: { persona: true, product: true },
      });

      if (!script) {
        return NextResponse.json({ error: "Guion no encontrado" }, { status: 404 });
      }

      if (script.clientId) {
        await assertClientAccess(prisma, script.clientId);
      }

      const rawScriptText = `${script.hook}\n\n${script.bodyText}\n\n${script.cta}`;
      const finalVoiceId = voiceId || script.persona.voiceId || "es-AR-TomasNeural";
      const finalAvatar = avatarUrl || script.persona.avatarUrl || "";
      const provider = (process.env.VIDEO_RENDER_PROVIDER || "local").toLowerCase();

      if (provider === "local") {
        const localJobId = `local_${scriptId}_${Date.now()}`;

        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarJobId: localJobId,
            avatarStatus: "PROCESSING",
            avatarVideoUrl: "",
            status: "RENDERING",
          },
        });

        renderLocalVideoInBackground({
          scriptId,
          script,
          text: rawScriptText,
          voiceId: finalVoiceId,
          avatarSource: finalAvatar,
        }).catch((err) => {
          console.error(`[api/videos/render] Local render background failure for ${scriptId}:`, err);
        });

        return NextResponse.json({ success: true, jobId: localJobId, provider: "local" });
      }

      const didPayload = buildDidPayload({
        rawScriptText,
        script,
        voiceId: finalVoiceId,
        voiceStyle,
        bgType,
        bgColor,
        stitch,
        rate,
        pitch,
        pauseDuration,
        styleDegree,
        padAudio,
        elevenLabsVoiceId,
        expressionHook,
        expressionBody,
        expressionCta,
      });

      const talk = await DIDService.createTalk({
        ...didPayload,
        avatarUrl: finalAvatar,
      });

      if (talk.status === "FAILED") {
        await prisma.videoScript.update({
          where: { id: scriptId },
          data: {
            avatarStatus: "FAILED",
            status: "FAILED",
          },
        });
        return NextResponse.json({ error: talk.error || "La API de D-ID falló al iniciar" }, { status: 500 });
      }

      await prisma.videoScript.update({
        where: { id: scriptId },
        data: {
          avatarJobId: talk.id,
          avatarStatus: talk.status,
          avatarVideoUrl: "",
          status: "RENDERING",
        },
      });

      return NextResponse.json({ success: true, jobId: talk.id, provider: "did" });
    }

    if (action === "create_manual_trend") {
      const { title, description, sourceUrl, platform, clientId, metadata } = body;

      if (!title || !platform || !clientId) {
        return NextResponse.json({ error: "Faltan parámetros obligatorios" }, { status: 400 });
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
          console.error("Error al scrapear URL de artículo:", fetchErr);
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
      const { scriptId, hook, bodyText, cta, visualCues, imgHook, imgBody, imgCta } = body;

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

      let finalVisualCues = visualCues || "";
      if (imgHook !== undefined || imgBody !== undefined || imgCta !== undefined) {
        let textPart = visualCues || "";
        try {
          const parsed = JSON.parse(script.visualCues);
          textPart = parsed.text || visualCues || "";
        } catch {
          // Existing value was not JSON.
        }
        finalVisualCues = JSON.stringify({
          text: textPart,
          imgHook: imgHook || "",
          imgBody: imgBody || "",
          imgCta: imgCta || "",
        });
      }

      const updated = await prisma.videoScript.update({
        where: { id: scriptId },
        data: {
          hook: hook || "",
          bodyText: bodyText || "",
          cta: cta || "",
          visualCues: finalVisualCues,
          audioPrompt: body.audioPrompt || "",
        },
      });

      return NextResponse.json({ success: true, script: updated });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/videos/post] Error:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}

async function renderLocalVideoInBackground(options: {
  scriptId: string;
  script: RenderableScript;
  text: string;
  voiceId: string;
  avatarSource: string;
}) {
  try {
    const avatar = await LocalAvatarRenderer.render({
      scriptId: options.scriptId,
      text: options.text,
      voiceId: options.voiceId,
      avatarSource: options.avatarSource,
    });

    await prisma.videoScript.update({
      where: { id: options.scriptId },
      data: {
        avatarStatus: "COMPLETED",
        status: "COMPOSING",
      },
    });

    await composeFinalVideoInBackground({
      scriptId: options.scriptId,
      script: options.script,
      avatarVideoUrl: avatar.outputUrl,
      fallbackVideoUrl: avatar.outputUrl,
    });
  } catch (err) {
    console.error(`[api/videos/render] Local avatar render failed for ${options.scriptId}:`, err);
    await prisma.videoScript.update({
      where: { id: options.scriptId },
      data: {
        avatarStatus: "FAILED",
        status: "FAILED",
      },
    });
  }
}

async function composeFinalVideoInBackground(options: {
  scriptId: string;
  script: RenderableScript;
  avatarVideoUrl: string;
  fallbackVideoUrl: string;
}) {
  const images = parseVisualImages(options.script.visualCues);
  const fallbackImg = getCategoryFallbackImage(options.script.product?.category);

  try {
    const finalVideoUrl = await FFmpegComposer.composeVideo({
      scriptId: options.scriptId,
      avatarVideoUrl: options.avatarVideoUrl,
      imgHookUrl: images.imgHook || fallbackImg,
      imgBodyUrl: images.imgBody || fallbackImg,
      imgCtaUrl: images.imgCta || fallbackImg,
      musicTrack: options.script.audioPrompt || "default",
      hookText: options.script.hook,
      bodyText: options.script.bodyText,
      ctaText: options.script.cta,
    });

    await prisma.videoScript.update({
      where: { id: options.scriptId },
      data: {
        avatarVideoUrl: finalVideoUrl,
        avatarStatus: "COMPLETED",
        status: "READY",
      },
    });
  } catch (err) {
    console.error(`[api/videos/render] Final composition failed for ${options.scriptId}:`, err);
    await prisma.videoScript.update({
      where: { id: options.scriptId },
      data: {
        avatarVideoUrl: options.fallbackVideoUrl,
        avatarStatus: "COMPLETED",
        status: "READY",
      },
    });
  }
}

function buildDidPayload(options: {
  rawScriptText: string;
  script: RenderableScript;
  voiceId: string;
  voiceStyle?: string;
  bgType?: string;
  bgColor?: string;
  stitch?: boolean;
  rate?: string;
  pitch?: string;
  pauseDuration?: number;
  styleDegree?: number;
  padAudio?: number;
  elevenLabsVoiceId?: string;
  expressionHook?: string;
  expressionBody?: string;
  expressionCta?: string;
}) {
  const needSsml =
    (options.rate && options.rate !== "1.0") ||
    (options.pitch && options.pitch !== "0%") ||
    (options.pauseDuration && Number(options.pauseDuration) > 0);

  let scriptText = options.rawScriptText;
  let ssml = false;

  if (needSsml) {
    ssml = true;
    const breakTag = options.pauseDuration && Number(options.pauseDuration) > 0 ? `<break time="${options.pauseDuration}ms"/>` : "";
    scriptText = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR"><voice name="${options.voiceId}"><prosody rate="${options.rate || "1.0"}" pitch="${options.pitch || "0%"}">${escapeXml(options.script.hook)}${breakTag}${escapeXml(options.script.bodyText)}${breakTag}${escapeXml(options.script.cta)}</prosody></voice></speak>`;
  }

  let bgColor: string | undefined;
  if (options.bgType === "chroma-green") {
    bgColor = "#00FF00";
  } else if (options.bgType === "chroma-blue") {
    bgColor = "#0000FF";
  } else if (options.bgType === "custom" && options.bgColor) {
    bgColor = options.bgColor;
  }

  return {
    scriptText,
    voiceId: options.voiceId,
    voiceStyle: options.voiceStyle,
    ssml,
    stitch: options.stitch !== undefined ? options.stitch : true,
    bgColor,
    styleDegree: options.styleDegree !== undefined ? Number(options.styleDegree) : null,
    padAudio: options.padAudio !== undefined ? Number(options.padAudio) : null,
    elevenLabsVoiceId: options.elevenLabsVoiceId || null,
    driverExpressions: buildDriverExpressions(options),
  };
}

function buildDriverExpressions(options: {
  script: RenderableScript;
  expressionHook?: string;
  expressionBody?: string;
  expressionCta?: string;
}) {
  if (!options.expressionHook && !options.expressionBody && !options.expressionCta) {
    return undefined;
  }

  const l1 = options.script.hook.length;
  const l2 = options.script.bodyText.length;
  const l3 = options.script.cta.length;
  const totalLen = l1 + l2 + l3 || 1;
  const totalFrames = 1000;
  const f1 = Math.round((l1 / totalLen) * totalFrames);
  const f2 = Math.round((l2 / totalLen) * totalFrames);

  return {
    expressions: [
      { start_frame: 0, expression: options.expressionHook || "neutral", intensity: 1.0 },
      { start_frame: Math.max(1, f1), expression: options.expressionBody || "neutral", intensity: 1.0 },
      { start_frame: Math.max(2, f1 + f2), expression: options.expressionCta || "neutral", intensity: 1.0 },
    ],
  };
}

function parseVisualImages(visualCues: string): { imgHook: string; imgBody: string; imgCta: string } {
  try {
    const parsed = JSON.parse(visualCues);
    return {
      imgHook: parsed.imgHook || "",
      imgBody: parsed.imgBody || "",
      imgCta: parsed.imgCta || "",
    };
  } catch {
    return { imgHook: "", imgBody: "", imgCta: "" };
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function getCategoryFallbackImage(category?: string | null): string {
  const cat = (category || "").toLowerCase();
  if (cat.includes("control") || cat.includes("midi") || cat.includes("pad")) {
    return "https://images.unsplash.com/photo-1618609378039-b572f64c5b42?auto=format&fit=crop&q=80&w=800";
  }
  if (cat.includes("pian") || cat.includes("tecla") || cat.includes("sint")) {
    return "https://images.unsplash.com/photo-1552422535-c45813c61732?auto=format&fit=crop&q=80&w=800";
  }
  if (cat.includes("auric") || cat.includes("headph") || cat.includes("monit")) {
    return "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&q=80&w=800";
  }
  if (cat.includes("mic") || cat.includes("grab")) {
    return "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=800";
  }
  if (cat.includes("bater") || cat.includes("drum") || cat.includes("percus")) {
    return "https://images.unsplash.com/photo-1524230572899-a752b3835840?auto=format&fit=crop&q=80&w=800";
  }
  return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800";
}

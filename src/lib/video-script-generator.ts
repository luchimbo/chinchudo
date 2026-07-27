import { prisma } from "./db";
import { llmHeaders, resolveLLMConfig } from "./llm-provider";

type ScriptGenerationContext = {
  trendId: string;
  productId: string;
  personaId: string;
  clientId: string;
};

export async function generateVideoScript(ctx: ScriptGenerationContext): Promise<string | null> {
  const { trendId, productId, personaId, clientId } = ctx;

  const trend = await prisma.trend.findUnique({ where: { id: trendId } });
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true },
  });
  const persona = await prisma.persona.findUnique({ where: { id: personaId } });
  const client = await prisma.client.findUnique({ where: { id: clientId } });

  if (!trend || !product || !persona || !client) {
    console.error("[Script Generator] Faltan entidades para generar guion", {
      trend: !!trend,
      product: !!product,
      persona: !!persona,
      client: !!client,
    });
    return null;
  }

  const llm = resolveLLMConfig(client);
  const apiKey = llm.apiKey;
  if (!apiKey) {
    console.error(`[Script Generator] API key de ${llm.provider} no configurada.`);
    return null;
  }

  const model = llm.model;
  const { taskInstruction, contextDetail } = buildTrendContext(trend);

  const prompt = `
Actua como redactor experto en guiones para videos cortos verticales (TikTok, Instagram Reels y YouTube Shorts) para PC MIDI Center en Argentina.

${taskInstruction}

### DATOS DE ENTRADA
${contextDetail}

2. Producto:
- Nombre: ${product.name}
- Marca: ${product.brand.name}
- Descripcion: ${product.description}
- Especificaciones tecnicas: ${product.technicalSpecs || "N/A"}
- Casos de uso: ${product.useCases || "N/A"}
- Posicionamiento de marca: ${product.brand.strengths}
- Tono de marca: ${product.brand.tone}

3. Persona:
- Nombre: ${persona.name}
- Rol: ${persona.role}
- Tono: ${persona.tone}
- Objetivo: ${persona.goals}
- Longitud deseada: ${persona.preferredLength}
- Frases recomendadas: ${persona.allowedPhrases || "Ninguna"}
- Frases prohibidas: ${persona.forbiddenPhrases || "Ninguna"}

### REGLAS
- El resultado sera usado por un operador humano para grabar o editar, no para render automatico.
- No menciones render, avatar, D-ID, FFmpeg, IA de video ni automatizacion.
- Escribe para Argentina con voseo natural si encaja con la persona.
- El hook debe funcionar en los primeros 3 segundos.
- El guion completo debe durar 20 a 40 segundos.
- No inventes stock, precio, garantia, datos tecnicos ni claims de superioridad.
- Resuelve una duda o muestra un caso de uso antes de vender.
- Respeta tono, frases prohibidas y claims de marca.
- Devuelve solamente JSON valido.

### JSON REQUERIDO
{
  "hook": "Gancho de 1 a 2 frases para los primeros 3 segundos.",
  "bodyText": "Desarrollo conversacional y creible para 15 a 30 segundos.",
  "cta": "Cierre suave, accion siguiente o pregunta util.",
  "visualCues": "Planos, textos en pantalla y acciones grabables para hook, cuerpo y cierre.",
  "audioPrompt": "Audio, ritmo o estilo de edicion sugerido para el operador.",
  "recommendedFormat": "TikTok | Reel | Short, con una razon breve si hace falta."
}
`;

  try {
    const response = await fetch(llm.endpoint, {
      method: "POST",
      headers: llmHeaders(llm, "Los 5 Apostoles - Editorial Video Script Generator"),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Eres un asistente experto en guiones de redes sociales. Devuelve unicamente JSON valido.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.75,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Script Generator] OpenRouter HTTP ${response.status}:`, errorText);
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      console.error("[Script Generator] OpenRouter devolvio contenido vacio.");
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error("[Script Generator] JSON invalido devuelto por IA:", content, parseErr);
      return null;
    }

    const visualCues = normalizeField(parsed.visualCues);
    const audioPrompt = [normalizeField(parsed.audioPrompt), parsed.recommendedFormat ? `Formato recomendado: ${parsed.recommendedFormat}` : ""]
      .filter(Boolean)
      .join("\n");

    const script = await prisma.videoScript.create({
      data: {
        clientId,
        trendId,
        brandId: product.brandId,
        productId,
        personaId,
        hook: normalizeField(parsed.hook),
        bodyText: normalizeField(parsed.bodyText),
        cta: normalizeField(parsed.cta),
        visualCues,
        audioPrompt,
        status: "NEW",
      },
    });

    return script.id;
  } catch (err) {
    console.error("[Script Generator] Error en llamada a OpenRouter:", err);
    return null;
  }
}

function buildTrendContext(trend: NonNullable<Awaited<ReturnType<typeof prisma.trend.findUnique>>>) {
  if (trend.platform === "VIRAL_CLONE" || trend.platform === "VIRAL_MARKETING") {
    return {
      taskInstruction:
        "Escribe un guion clonando la estructura, el ritmo y el tipo de gancho de una referencia viral de marketing, adaptandolo al producto y a la persona elegida.",
      contextDetail: `1. Estructura viral:
- Titulo/concepto: ${trend.title}
- Enlace: ${trend.sourceUrl || "N/A"}
- Dinamica original: ${trend.description}`,
    };
  }

  if (trend.platform === "URL_ARTICLE") {
    return {
      taskInstruction:
        "Escribe un guion corto a partir de una referencia tecnica o articulo, extrayendo puntos fuertes, casos de uso y objeciones utiles.",
      contextDetail: `1. Referencia:
- Titulo/fuente: ${trend.title}
- Enlace: ${trend.sourceUrl || "N/A"}
- Contenido extraido: ${trend.description}`,
    };
  }

  return {
    taskInstruction:
      "Escribe un guion basado en una tendencia actual y un producto especifico del catalogo, listo para que un operador lo revise, edite y grabe.",
    contextDetail: `1. Tendencia:
- Titulo: ${trend.title}
- Descripcion: ${trend.description}
- Red/origen: ${trend.platform}
- URL: ${trend.sourceUrl || "N/A"}
- Busqueda usada: ${trend.queryUsed || "N/A"}`,
  };
}

function normalizeField(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join("\n");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

import { prisma } from "./db";
import { llmHeaders, resolveLLMConfig, resolveOpenRouterConfig, type LLMConfig } from "./llm-provider";

type ScriptGenerationContext = {
  contentIdeaId?: string;
  trendId?: string;
  productId?: string;
  personaId: string;
  clientId: string;
};

export async function generateVideoScript(ctx: ScriptGenerationContext): Promise<string | null> {
  const { trendId, productId, personaId, clientId, contentIdeaId } = ctx;

  const idea = contentIdeaId ? await prisma.contentIdea.findUnique({ where: { id: contentIdeaId }, include: { trend: true } }) : null;
  const trend = idea?.trend ?? (trendId ? await prisma.trend.findUnique({ where: { id: trendId } }) : null);
  const product = await prisma.product.findUnique({
    where: { id: idea?.productId ?? productId },
    include: { brand: true },
  });
  const persona = await prisma.persona.findUnique({ where: { id: personaId } });
  const client = await prisma.client.findUnique({ where: { id: clientId } });

  if (!product || !persona || !client || (contentIdeaId && !idea)) {
    console.error("[Script Generator] Faltan entidades para generar guion", {
      trend: !!trend || !!idea,
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

  const { taskInstruction, contextDetail } = idea
    ? { taskInstruction: "Escribe el guion a partir de una idea editorial ya aprobada. Respeta su formato, gancho y direccion visual.", contextDetail: `1. Idea aprobada:\n- Formato: ${idea.format}\n- Hook: ${idea.hook}\n- Por que funciona: ${idea.rationale}\n- Direccion visual: ${idea.visualDirection}\n- Intencion: ${idea.intent}\n- Referencia: ${trend?.title || "Estructura evergreen"}` }
    : trend ? buildTrendContext(trend) : { taskInstruction: "Escribe un guion basado en el producto.", contextDetail: "1. Idea editorial: usar una estructura clara y grabable." };

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

  async function requestCompletion(config: LLMConfig) {
    return fetch(config.endpoint, {
      method: "POST",
      headers: llmHeaders(config, "Los 5 Apostoles - Editorial Video Script Generator"),
      body: JSON.stringify({
        model: config.model,
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
  }

  try {
    let response: Response;
    try {
      response = await requestCompletion(llm);
    } catch (error) {
      if (llm.provider !== "local") throw error;
      const fallback = resolveOpenRouterConfig(client);
      if (!fallback.apiKey) throw error;
      console.warn("[Script Generator] El LLM local no respondió; se usa OpenRouter como respaldo.");
      response = await requestCompletion(fallback);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let usedFallback = false;
      if (llm.provider === "local") {
        const fallback = resolveOpenRouterConfig(client);
        if (fallback.apiKey) {
          console.warn(`[Script Generator] LLM local HTTP ${response.status}; se usa OpenRouter como respaldo.`);
          response = await requestCompletion(fallback);
          usedFallback = true;
        }
      }
      if (!response.ok) {
        const fallbackErrorText = usedFallback ? await response.text() : errorText;
        console.error(`[Script Generator] ${llm.provider} HTTP ${response.status}:`, fallbackErrorText || errorText);
        return null;
      }
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
        trendId: trend?.id,
        contentIdeaId: idea?.id,
        brandId: product.brandId,
        productId: product.id,
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
    console.error(`[Script Generator] Error en llamada a ${llm.provider}:`, err);
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

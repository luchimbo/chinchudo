import { prisma } from "./db";

type ScriptGenerationContext = {
  trendId: string;
  productId: string;
  personaId: string;
  clientId: string;
};

type ScriptOutput = {
  hook: string;
  bodyText: string;
  cta: string;
  visualCues: string;
  audioPrompt: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function generateVideoScript(ctx: ScriptGenerationContext): Promise<string | null> {
  const { trendId, productId, personaId, clientId } = ctx;

  // 1. Obtener entidades de la base de datos
  const trend = await prisma.trend.findUnique({ where: { id: trendId } });
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true },
  });
  const persona = await prisma.persona.findUnique({ where: { id: personaId } });
  const client = await prisma.client.findUnique({ where: { id: clientId } });

  if (!trend || !product || !persona || !client) {
    console.error("[Script Generator] Error: No se encontraron todas las entidades en la base de datos", {
      trend: !!trend,
      product: !!product,
      persona: !!persona,
      client: !!client,
    });
    return null;
  }

  // 2. Resolver API Key y Modelo de OpenRouter
  const apiKey = client.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[Script Generator] Error: OPENROUTER_API_KEY no configurada.");
    return null;
  }

  const model = client.openrouterModel?.trim() || process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-lite";

  // 3. Construir el Prompt
  const prompt = `
Actúa como un redactor de guiones experto en videos cortos (Reels, TikTok, YouTube Shorts, formato 9:16) para la tienda de instrumentos y audio "PC MIDI Center" en Argentina.

Vas a escribir un guion de video basado en una TENDENCIA ACTUAL y en un PRODUCTO específico de nuestro catálogo, hablando con el arquetipo de voz de una PERSONA específica.

### DATOS DE ENTRADA:
1. **Tendencia (Trend)**:
   - Título: ${trend.title}
   - Descripción: ${trend.description}
   - Red/Origen: ${trend.platform}

2. **Producto**:
   - Nombre: ${product.name}
   - Marca: ${product.brand.name}
   - Descripción: ${product.description}
   - Especificaciones Técnicas: ${product.technicalSpecs || "N/A"}
   - Casos de Uso: ${product.useCases || "N/A"}
   - Posicionamiento de la marca: ${product.brand.strengths}
   - Tono de la marca: ${product.brand.tone}

3. **Voz del Operador (Persona)**:
   - Nombre: ${persona.name}
   - Rol: ${persona.role}
   - Tono/Voz: ${persona.tone}
   - Objetivo: ${persona.goals}
   - Longitud deseada: ${persona.preferredLength}
   - Frases recomendadas: ${persona.allowedPhrases || "Ninguna"}
   - Frases/Términos prohibidos: ${persona.forbiddenPhrases || "Ninguno"}

### INSTRUCCIONES DE REDACCIÓN:
- Debes redactar el guion enfocado al público de **Argentina**. Utilizá modismos locales (lunfardo sutil, voseo: "tenés", "mirá", "comprá", "está", "che") si se adapta al tono de la Persona, pero sin exagerar para no sonar artificial.
- El guion debe ser corto (aprox. 30-45 segundos de lectura fluida).
- Respetá estrictamente las frases prohibidas de la Persona y los lineamientos de claims prohibidos de la marca.
- Estructurá el output en formato JSON válido.

### FORMATO JSON REQUERIDO:
El output debe ser estrictamente un objeto JSON con las siguientes propiedades:
{
  "hook": "El gancho del video (primeros 3 segundos). Debe capturar la atención mencionando la tendencia o el dolor común del músico/productor de forma muy directa.",
  "bodyText": "El desarrollo del guion (15-30 segundos). Aquí la Persona habla sobre el producto de forma natural, resolviendo la duda o conectándola con la tendencia de forma conversacional y creíble.",
  "cta": "El llamado a la acción final (5 segundos). Debe sugerir ver la landing page o visitar la tienda sin ser demasiado agresivo. Ej: 'Si querés saber más, date una vuelta por el link de la bio.'",
  "visualCues": "Lista o párrafos breves describiendo qué se debe mostrar visualmente en cada parte del video (ej: 'Mostrar primer plano del controlador Midiplus', 'Texto grande en pantalla con la especificación').",
  "audioPrompt": "Descripción del fondo de audio sugerido (ej: 'Beat de lo-fi relajado', 'Sonido de redoblante con mucha reverberación')."
}
`;

  // 4. Llamar a OpenRouter
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://10apostoles.local",
        "X-Title": "10 Apostoles - Video Script Generator",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Eres un asistente de redacción experto en videos de redes sociales que devuelve únicamente JSON válido.",
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
      console.error(`[Script Generator] OpenRouter error HTTP ${response.status}:`, errorText);
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";

    if (!content.trim()) {
      console.error("[Script Generator] OpenRouter devolvió un contenido vacío.");
      return null;
    }

    // 5. Parsear el output y guardarlo en la base de datos
    let parsed: ScriptOutput;
    try {
      parsed = JSON.parse(content) as ScriptOutput;
    } catch (parseErr) {
      console.error("[Script Generator] Error al parsear JSON devuelto por la IA:", content, parseErr);
      return null;
    }

    const script = await prisma.videoScript.create({
      data: {
        clientId,
        trendId,
        brandId: product.brandId,
        productId,
        personaId,
        hook: parsed.hook || "",
        bodyText: parsed.bodyText || "",
        cta: parsed.cta || "",
        visualCues: parsed.visualCues || "",
        audioPrompt: parsed.audioPrompt || "",
        status: "NEW",
      },
    });

    return script.id;
  } catch (err) {
    console.error("[Script Generator] Error en la llamada API a OpenRouter:", err);
    return null;
  }
}

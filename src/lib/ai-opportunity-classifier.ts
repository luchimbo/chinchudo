import type { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

export type ClassificationResult = {
  isSpanish: boolean;
  isSpamOrFluff: boolean;
  isRelevant: boolean;
  actionableReason: string;
  detectedIntent:
    | "TECHNICAL_QUESTION"
    | "PURCHASE_QUESTION"
    | "PRICE_QUESTION"
    | "WARRANTY_QUESTION"
    | "COMPARISON"
    | "COMPLAINT"
    | "COMPETITOR_MENTION"
    | "GENERAL_DISCUSSION";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  matchedBrandId: string | null;
  matchedProductId: string | null;
  confidence: "high" | "medium" | "low";
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function logClassifierError(context: string, detail: unknown) {
  logger.error("ai_classifier_error", context, detail ?? undefined).catch(() => {});
  console.error(`[AI Classifier] ${context}`, detail);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt <= retries) {
        const wait = RETRY_DELAY_MS * attempt;
        logClassifierError(`Intento ${attempt} fallido (HTTP ${res.status}), reintentando en ${wait}ms…`, null);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt <= retries) {
        const wait = RETRY_DELAY_MS * attempt;
        logClassifierError(`Intento ${attempt} fallido (red), reintentando en ${wait}ms…`, err);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error("fetchWithRetry: no se pudo completar la llamada");
}

export async function classifyOpportunity(
  prisma: PrismaClient,
  candidate: {
    sourceText: string;
    sourceTitle?: string;
    videoTitle?: string;
    channel: string;
    clientId: string;
  }
): Promise<ClassificationResult> {
  // 1. Cargar contexto del cliente
  const [client, brands, products, knowledgeBase] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: candidate.clientId } }),
    prisma.brand.findMany({ where: { clientId: candidate.clientId } }),
    prisma.product.findMany({
      where: { brand: { clientId: candidate.clientId } },
      include: { brand: true }
    }),
    prisma.knowledgeBase.findMany({ where: { clientId: candidate.clientId }, take: 15 })
  ]);

  // 2. Construir sumarios para el prompt
  const brandsList = brands.map((b) => `- ${b.name}: ${b.positioning}`).join("\n");
  const productsList = products
    .map((p) => `- ID: ${p.id} | Nombre: ${p.name} | Marca: ${p.brand.name} | Categoría: ${p.category} | Descripción: ${p.description}`)
    .join("\n");
  const kbSummary = knowledgeBase.map((k) => `- Tema: ${k.topic} | Contenido: ${k.content}`).join("\n");

  const prompt = `Actúas como un clasificador experto de oportunidades y validador de calidad comercial en redes sociales para el cliente: "${client.name}" (${client.slug}).
Tu única tarea es analizar el texto de entrada y compararlo con el catálogo y conocimiento del negocio para categorizarlo o descartarlo.

## Información de Negocio del Cliente
### Marcas asociadas:
${brandsList || "- Ninguna marca cargada"}

### Productos en catálogo:
${productsList || "- Ningún producto en catálogo"}

### Conocimiento básico:
${kbSummary || "- Ningún conocimiento cargado"}

## Reglas de Evaluación e Idioma
1. **Idioma**: La oportunidad debe estar estrictamente en idioma ESPAÑOL (debe ser la lengua principal del post/comentario. Se permiten modismos hispanos o palabras técnicas aisladas en inglés como 'driver', 'interface', 'plugin', pero si el texto completo está en inglés u otro idioma, marca "isSpanish": false).
2. **Spam o Ruido**: Comentarios de un solo emoji, etiquetas a amigos (ej. "@juan look"), o expresiones vacías y de alabanza sin contenido ("qué lindo", "me gusta", "buena foto") deben marcarse como "isSpamOrFluff": true.
3. **Relevancia comercial**: Para ser relevante ("isRelevant": true), el texto debe mencionar, consultar o discutir temas de las marcas, productos o del nicho de mercado del cliente (ej: si el cliente vende controladores midi, preguntar sobre latencia, pianos, drivers, o grabaciones de home studio es relevante. Si el cliente vende medias, preguntar sobre abrigo, calzado, medias térmicas, es relevante. Si preguntan sobre comida, viajes o temas ajenos, marca "isRelevant": false).
4. **Intención ("detectedIntent")**:
   - TECHNICAL_QUESTION: Preguntas técnicas sobre funcionamiento, drivers, configuración, compatibilidad.
   - PURCHASE_QUESTION: Intención directa de compra ("dónde lo consigo", "tienen stock", "cómo lo compro").
   - PRICE_QUESTION: Preguntas sobre costo, precio o financiación.
   - WARRANTY_QUESTION: Consultas de servicio técnico oficial, devolución o fallas en garantía.
   - COMPARISON: Comparativa explícita de este producto/marca contra otra ("¿Midiplus o Akai?").
   - COMPLAINT: Queja, descontento o reclamo.
   - COMPETITOR_MENTION: Mención de productos de competidores directos.
   - GENERAL_DISCUSSION: Consultas o afirmaciones generales del nicho.
5. **Prioridad ("priority")**:
   - HIGH/URGENT si expresa fuerte intención de compra inmediata o soporte de garantía urgente.
   - MEDIUM si es una duda técnica normal o de precios.
   - LOW para discusiones generales de baja urgencia.
6. **Mapeo de Entidades**:
   - "matchedBrandId": ID exacto de la marca (de las listadas arriba) que se discute. Si no se puede determinar, usa null.
   - "matchedProductId": ID exacto del producto del catálogo (de los listados arriba con su ID) que se menciona o consulta. Si no se menciona ningún modelo específico de tu catálogo, usa null.

## Datos de la Oportunidad a Analizar
- Canal: ${candidate.channel}
- Título/Contexto de origen: ${candidate.sourceTitle || candidate.videoTitle || "Sin título"}
- Texto del post o comentario: "${candidate.sourceText}"

## Formato de Salida Requerido (JSON estricto, sin tags markdown)
Devuelve únicamente un objeto JSON con las siguientes propiedades. No agregues explicaciones fuera del JSON.
{
  "isSpanish": true/false,
  "isSpamOrFluff": true/false,
  "isRelevant": true/false,
  "actionableReason": "Explicación breve de por qué califica o por qué se descarta (en español)",
  "detectedIntent": "TECHNICAL_QUESTION" | "PURCHASE_QUESTION" | "PRICE_QUESTION" | "WARRANTY_QUESTION" | "COMPARISON" | "COMPLAINT" | "COMPETITOR_MENTION" | "GENERAL_DISCUSSION",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "matchedBrandId": "id_de_la_marca_en_el_catalogo" o null,
  "matchedProductId": "id_del_producto_en_el_catalogo" o null,
  "confidence": "high" | "medium" | "low"
}
`;

  // 3. Obtener credenciales de OpenRouter
  const apiKey = client.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("No se ha configurado la API Key de OpenRouter para la clasificación.");
  }
  const model = client.openrouterModel?.trim() || process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-lite";

  try {
    const response = await fetchWithRetry(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://10apostoles.local",
        "X-Title": "10 Apostoles - Opportunity Classifier",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1, // temperatura baja para más consistencia en clasificación
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`OpenRouter devolvió error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new Error("Respuesta vacía de OpenRouter.");
    }

    const parsed = JSON.parse(content) as ClassificationResult;
    return {
      isSpanish: !!parsed.isSpanish,
      isSpamOrFluff: !!parsed.isSpamOrFluff,
      isRelevant: !!parsed.isRelevant,
      actionableReason: parsed.actionableReason || "",
      detectedIntent: parsed.detectedIntent || "GENERAL_DISCUSSION",
      priority: parsed.priority || "LOW",
      matchedBrandId: parsed.matchedBrandId || null,
      matchedProductId: parsed.matchedProductId || null,
      confidence: parsed.confidence || "low",
    };
  } catch (error) {
    logClassifierError(`Error al clasificar oportunidad de canal ${candidate.channel}`, error);
    // Fallback básico ante falla del modelo
    return {
      isSpanish: true,
      isSpamOrFluff: false,
      isRelevant: true,
      actionableReason: "Falla de conexión con el clasificador IA. Importado con clasificación local básica.",
      detectedIntent: "GENERAL_DISCUSSION",
      priority: "LOW",
      matchedBrandId: null,
      matchedProductId: null,
      confidence: "low",
    };
  }
}

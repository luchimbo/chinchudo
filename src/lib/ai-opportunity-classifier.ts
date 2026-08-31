import type { Brand, PrismaClient, Service } from "@prisma/client";
import { logger } from "./logger";
import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import {
  calculateOpportunityScore,
  isContextualCandidate,
  normalizeAssessment,
  prestigeFallbackAssessment,
  priorityFromOpportunityScore,
  type ContextualAssessment,
} from "./contextual-opportunity";

export type ClassificationResult = {
  isSpanish: boolean;
  isSupportedLanguage: boolean;
  language: "es" | "en" | "pt" | "other";
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
  assessment: ContextualAssessment;
  opportunityScore: number;
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function hasDirectFallbackSignal(text: string) {
  return /\?|\b(comprar|precio|cuanto|cuánto|stock|env[ií]o|garant[ií]a|recomiendan|conviene|problema|ayuda)\b/i.test(text);
}

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
      // A caller-owned timeout aborted the request. Retrying would leave the
      // importer with more in-flight calls after it has already moved on.
      if (options.signal?.aborted) throw err;
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
    sourceType?: string;
    channel: string;
    clientId: string;
    signal?: AbortSignal;
  }
): Promise<ClassificationResult> {
  // 1. Cargar contexto del cliente
  const [client, brands, products, services, knowledgeBase] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: candidate.clientId } }),
    prisma.brand.findMany({ where: { clientId: candidate.clientId } }),
    prisma.product.findMany({
      where: { brand: { clientId: candidate.clientId } },
      include: { brand: true }
    }),
    // Los dobles de prueba y las bases que todavía no aplicaron la migración
    // pueden no exponer Service; en ese caso clasificamos con el resto del contexto.
    (prisma as any).service?.findMany({ where: { brand: { clientId: candidate.clientId } }, include: { brand: true } }) ?? Promise.resolve([]),
    prisma.knowledgeBase.findMany({ where: { clientId: candidate.clientId }, take: 15 })
  ]);

  // 2. Construir sumarios para el prompt
  const brandsList = brands.map((b) => `- ${b.name}: Fortalezas: ${b.strengths} | Debilidades competencia: ${b.competitorWeaknesses || "No especificadas"}`).join("\n");
  const productsList = products
    .map((p) => `- ID: ${p.id} | Nombre: ${p.name} | Marca: ${p.brand.name} | Categoría: ${p.category} | Descripción: ${p.description}`)
    .join("\n");
  const servicesList = (services as Array<Service & { brand: Brand }>).map((service) => `- ${service.name} | Marca: ${service.brand.name} | Categoría: ${service.category} | Descripción: ${service.description || service.scope}`).join("\n");
  const kbSummary = knowledgeBase.map((k) => `- Tema: ${k.topic} | Contenido: ${k.content}`).join("\n");

  const prompt = `Actúas como un clasificador experto de oportunidades y validador de calidad comercial en redes sociales para el cliente: "${client.name}" (${client.slug}).
Tu única tarea es analizar el texto de entrada y compararlo con el catálogo y conocimiento del negocio para categorizarlo o descartarlo.

## Información de Negocio del Cliente
### Marcas asociadas:
${brandsList || "- Ninguna marca cargada"}

### Productos en catálogo:
${productsList || "- Ningún producto en catálogo"}

### Servicios en catálogo:
${servicesList || "- Ningún servicio en catálogo"}

### Conocimiento básico:
${kbSummary || "- Ningún conocimiento cargado"}

## Reglas de Evaluación e Idioma
1. **Idioma**: Detectá el idioma del post/comentario. Soportamos los siguientes idiomas: ESPAÑOL ("es"), INGLÉS ("en") y PORTUGUÉS ("pt"). Si el comentario está en cualquiera de estos tres idiomas, consideralo soportado ("isSupportedLanguage": true). Si el comentario está en cualquier otro idioma, indicalo como "other" ("isSupportedLanguage": false). Si el idioma es español, marcá "isSpanish": true (de lo contrario false).
2. **Spam o Ruido**: Comentarios de un solo emoji, etiquetas a amigos (ej. "@juan look"), o expresiones vacías y de alabanza sin contenido ("qué lindo", "me gusta", "buena foto") deben marcarse como "isSpamOrFluff": true.
3. **Relevancia comercial**: Para ser relevante ("isRelevant": true), el texto debe mencionar, consultar o discutir temas de las marcas, productos o del nicho de mercado del cliente (ej: si el cliente vende controladores midi, preguntar sobre latencia, pianos, drivers, o grabaciones de home studio es relevante. Si el cliente vende medias, preguntar sobre abrigo, calzado, medias térmicas, es relevante. Si preguntan sobre comida, viajes o temas ajenos, marca "isRelevant": false).
   - Para **PC MIDI**, una mención de Millenium junto con batería electrónica, drums o un modelo MPS es un competidor relevante. Clasificala como COMPETITOR_MENTION, COMPARISON, COMPLAINT o la intención directa que corresponda; no la descartes por no pertenecer al catálogo propio.
   - Para **Prestige Running**, aceptá solo español con contexto concreto sobre running, entrenamiento, indumentaria deportiva, calzado, comodidad del pie, roce, sudoración, ampollas o recuperación general. Una buena oportunidad permite sumar una recomendación de medias técnicas sin forzar la venta.
   - Para Prestige descartá publicaciones de venta de terceros, sorteos, texto corporativo, spam y consultas médicas que pidan diagnóstico o tratamiento. Nunca interpretes la compresión como tratamiento o prevención de lesiones.
4. **Intención ("detectedIntent")**:
   - TECHNICAL_QUESTION: Preguntas técnicas sobre funcionamiento, drivers, configuración, compatibilidad.
   - PURCHASE_QUESTION: Intención directa de compra ("dónde lo consigo", "tienen stock", "cómo lo compro").
   - PRICE_QUESTION: Preguntas sobre costo, precio o financiación.
   - WARRANTY_QUESTION: Consultas de servicio técnico oficial, devolución o fallas en garantía.
   - COMPARISON: Comparativa explícita de este producto/marca contra otra ("¿Midiplus o Akai?").
   - COMPLAINT: Queja, descontento o reclamo.
   - COMPETITOR_MENTION: Mención de productos de competidores directos.
   - GENERAL_DISCUSSION: Consultas o afirmaciones generales del nicho.
5. **Lectura contextual obligatoria**: evaluá el contenido completo, no solamente una pregunta literal. Devolvé puntajes de 0 a 100 para audiencia afín, contexto natural de participación, problema que el negocio puede resolver, espacio conversacional y riesgo. Para marcar una publicación como contextual_presence necesitás evidencia textual concreta de audiencia y contexto; no alcanza una keyword aislada. risk alto para spam, venta ajena, contenido sensible, hostilidad o participación forzada.
   - direct_response: hay una consulta, objeción o intención que amerita responder directamente.
   - contextual_presence: audiencia/contexto muy afines aunque no exista una pregunta de compra; sugerí cómo aportar valor sin vender de forma invasiva.
   - discard: no conviene intervenir.
6. **Prioridad ("priority")**:
   - HIGH para conversaciones sobre baterías Millenium o modelos MPS cuando exista contenido real para responder. La prioridad no autoriza inventar defectos.
   - Para Prestige Running, HIGH cuando la audiencia sea claramente runner y exista un puente natural hacia medias técnicas: trail, equipamiento esencial, indumentaria, calzado, comodidad del pie, roce, humedad, ampollas o rendimiento. MEDIUM para contenido general de running donde convenga revisar la conversación antes de intervenir.
   - HIGH/URGENT si expresa fuerte intención de compra inmediata o soporte de garantía urgente.
   - MEDIUM si es una duda técnica normal o de precios.
   - LOW para discusiones generales de baja urgencia.
7. **Mapeo de Entidades**:
   - "matchedBrandId": ID exacto de la marca (de las listadas arriba) que se discute. Si no se puede determinar, usa null.
   - "matchedProductId": ID exacto del producto del catálogo (de los listados arriba con su ID) que se menciona o consulta. Si no se menciona ningún modelo específico de tu catálogo, usa null.

## Datos de la Oportunidad a Analizar
- Canal: ${candidate.channel}
- Tipo de fuente: ${candidate.sourceType || "post o comentario"}
- Título/Contexto de origen: ${candidate.sourceTitle || candidate.videoTitle || "Sin título"}
- Texto del post o comentario: "${candidate.sourceText}"

## Formato de Salida Requerido (JSON estricto, sin tags markdown)
Devuelve únicamente un objeto JSON con las siguientes propiedades. No agregues explicaciones fuera del JSON.
{
  "language": "es" | "en" | "pt" | "other",
  "isSupportedLanguage": true/false,
  "isSpanish": true/false,
  "isSpamOrFluff": true/false,
  "isRelevant": true/false,
  "actionableReason": "Explicación breve de por qué califica o por qué se descarta (en español)",
  "detectedIntent": "TECHNICAL_QUESTION" | "PURCHASE_QUESTION" | "PRICE_QUESTION" | "WARRANTY_QUESTION" | "COMPARISON" | "COMPLAINT" | "COMPETITOR_MENTION" | "GENERAL_DISCUSSION",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "matchedBrandId": "id_de_la_marca_en_el_catalogo" o null,
  "matchedProductId": "id_del_producto_en_el_catalogo" o null,
  "confidence": "high" | "medium" | "low"
  ,"assessment": {
    "audienceFit": 0-100,
    "contextFit": 0-100,
    "problemFit": 0-100,
    "conversationFit": 0-100,
    "risk": 0-100,
    "opportunityType": "direct_response" | "contextual_presence" | "discard",
    "recommendedApproach": "enfoque breve y concreto; vacío si se descarta",
    "evidence": { "audienceFit": "frase o dato visible", "contextFit": "frase o dato visible", "problemFit": "frase o dato visible", "conversationFit": "frase o dato visible", "risk": "frase o dato visible" },
    "confidence": "high" | "medium" | "low"
  }
}
`;

  // 3. Obtener credenciales de OpenRouter
  const llm = resolveLLMConfig(client);
  const apiKey = llm.apiKey;
  if (!apiKey) {
    throw new Error("No se ha configurado la API Key de OpenRouter para la clasificación.");
  }
  const model = llm.model;

  try {
    const { response } = await fetchChatCompletion(
      llm,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1, // temperatura baja para más consistencia en clasificación
        max_tokens: 1000,
      },
      "Los 5 Apostoles - Opportunity Classifier",
      client,
      { signal: candidate.signal },
    );

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
    const detectedIntent = parsed.detectedIntent || "GENERAL_DISCUSSION";
    let assessment = normalizeAssessment(parsed.assessment, detectedIntent);
    let opportunityScore = calculateOpportunityScore(assessment, detectedIntent);
    const prestigeText = `${candidate.sourceTitle || ""} ${candidate.videoTitle || ""} ${candidate.sourceText}`;
    const prestigeUnsafe = /\b(diagnostico|diagnóstico|recet[a-z]*|medicacion|medicación|lesi[oó]n|cura[r]?|trombosis|varices|várices|cirugia|cirugía|vendo|liquido|mayorista|distribuidor|oferta imperdible|sorteo|giveaway)\b/i.test(prestigeText);
    if (client.slug === "prestige-running" && parsed.isSpanish && parsed.isSupportedLanguage && !parsed.isSpamOrFluff && !prestigeUnsafe) {
      const prestigeBaseline = prestigeFallbackAssessment(prestigeText);
      const prestigeBaselineScore = calculateOpportunityScore(prestigeBaseline, detectedIntent);
      if (prestigeBaselineScore > opportunityScore) {
        assessment = prestigeBaseline;
        opportunityScore = prestigeBaselineScore;
      }
    }
    const contextualValid = isContextualCandidate(assessment);
    const isRelevant = (!!parsed.isRelevant || client.slug === "prestige-running")
      && (assessment.opportunityType === "direct_response" || contextualValid);
    return {
      isSpanish: !!parsed.isSpanish,
      isSupportedLanguage: !!parsed.isSupportedLanguage,
      language: parsed.language || "es",
      isSpamOrFluff: !!parsed.isSpamOrFluff,
      isRelevant,
      actionableReason: parsed.actionableReason || "",
      detectedIntent,
      priority: priorityFromOpportunityScore(opportunityScore, detectedIntent),
      matchedBrandId: parsed.matchedBrandId || null,
      matchedProductId: parsed.matchedProductId || null,
      confidence: parsed.confidence || "low",
      assessment,
      opportunityScore,
    };
  } catch (error) {
    logClassifierError(`Error al clasificar oportunidad de canal ${candidate.channel}`, error);
    // Fallback básico ante falla del modelo
    const directFallback = hasDirectFallbackSignal(`${candidate.sourceTitle || ""} ${candidate.videoTitle || ""} ${candidate.sourceText}`);
    const fallbackIntent = directFallback ? "GENERAL_DISCUSSION" : "GENERAL_DISCUSSION";
    const assessment = normalizeAssessment({
      opportunityType: directFallback ? "direct_response" : "discard",
      confidence: "low",
      recommendedApproach: directFallback ? "Revisar la consulta y responder solo con información confirmada." : "",
    }, fallbackIntent);
    return {
      isSpanish: true,
      isSupportedLanguage: true,
      language: "es",
      isSpamOrFluff: false,
      isRelevant: directFallback,
      actionableReason: "Falla de conexión con el clasificador IA. Importado con clasificación local básica.",
      detectedIntent: fallbackIntent,
      priority: directFallback ? "MEDIUM" : "LOW",
      matchedBrandId: null,
      matchedProductId: null,
      confidence: "low",
      assessment,
      opportunityScore: directFallback ? 40 : 0,
    };
  }
}

import type { Brand, CatalogRule, Channel, Client, Opportunity, Persona, Product } from "@prisma/client";
import { selectRelevantProducts, type ScopedProduct } from "./catalog";
import type { KnowledgeLike, ObjectionLike } from "./knowledge";
import { logger } from "./logger";

type DraftContext = {
  opportunity: Opportunity & {
    channel: Channel;
    detectedBrand: Brand | null;
    detectedProduct: Product | null;
  };
  brand: Brand;
  persona: Persona;
  client?: Client;
  catalogProducts?: ScopedProduct[];
  catalogRules?: Pick<CatalogRule, "category" | "keywords">[];
  knowledge?: KnowledgeLike[];
  objections?: ObjectionLike[];
  activeSystemPrompt?: string | null;
};

type DraftVariant = {
  variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
  draftText: string;
  riskNotes: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const INTENT_LABELS: Record<string, string> = {
  TECHNICAL_QUESTION: "pregunta técnica (driver, compatibilidad, configuración)",
  PURCHASE_QUESTION: "pregunta de compra (dónde comprar, stock, disponibilidad)",
  PRICE_QUESTION: "consulta de precio",
  WARRANTY_QUESTION: "consulta de garantía o servicio posventa",
  COMPARISON: "comparativa entre productos",
  GENERAL_DISCUSSION: "comentario general / consulta abierta",
};

function buildPrompt(ctx: DraftContext): string {
  const { opportunity, brand, persona } = ctx;
  const client = ctx.client;
  const product = opportunity.detectedProduct;
  const intent = INTENT_LABELS[opportunity.detectedIntent] ?? opportunity.detectedIntent;

  const relevant = selectRelevantProducts(opportunity.sourceText, product, 8, {
    catalogProducts: ctx.catalogProducts,
    catalogRules: ctx.catalogRules,
    scoped: !!client,
  });
  const relevantIds = new Set(relevant.map(p => p.id));
  const rest = (ctx.catalogProducts ?? [])
    .filter(p => !relevantIds.has(p.id))
    .map(p => ({ id: p.id, nombre: p.name, marca: p.brand?.name ?? "", modelo: p.name, uso: p.useCases || p.description }));

  const relevantBlock = relevant.length > 0
    ? `### Más relevantes para este comentario (priorizalos)\n${relevant.map(p => `  - ${p.nombre} (${p.marca} ${p.modelo}): ${p.uso}`).join("\n")}`
    : "";
  const restBlock = rest.length > 0
    ? `### Resto del catálogo (usá solo si aplica al tema)\n${rest.map(p => `  - ${p.nombre} (${p.marca} ${p.modelo}): ${p.uso}`).join("\n")}`
    : "";
  const productList = [relevantBlock, restBlock].filter(Boolean).join("\n") || "  - (sin productos específicos identificados)";

  const forbiddenExtra = persona.forbiddenPhrases
    ? `\n- Frases prohibidas específicas de tu voz: ${persona.forbiddenPhrases}`
    : "";
  const allowedExtra = persona.allowedPhrases
    ? `\n- Frases y marcos habituales en tu voz: ${persona.allowedPhrases}`
    : "";
  const goodEx = persona.goodExamples
    ? `\n### Ejemplo de respuesta buena para tu voz\n"${persona.goodExamples}"\n`
    : "";
  const badEx = persona.badExamples
    ? `\n### Ejemplo de respuesta PROHIBIDA\n"${persona.badExamples}"\n`
    : "";

  const knowledge = ctx.knowledge ?? [];
  const objections = ctx.objections ?? [];
  const knowledgeBlock = knowledge.length > 0
    ? `\n## Datos verificados que SÍ podés usar (no inventes nada fuera de esto)\n${knowledge.map((k) => `- ${k.topic}: ${k.content}`).join("\n")}\n`
    : "";
  const objectionsBlock = objections.length > 0
    ? `\n## Objeciones frecuentes y cómo encararlas (guía interna, adaptá a tu voz)\n${objections.map((o) => `- Si plantea "${o.objection}" → ${o.recommendedAnswer}`).join("\n")}\n`
    : "";

  // Carga de exclusiones y reglas específicas de rubro
  let exclusions: string[] = [];
  if (client?.domainExclusions) {
    try {
      const parsed = JSON.parse(client.domainExclusions);
      exclusions = Array.isArray(parsed) ? parsed : [];
    } catch {
      exclusions = client.domainExclusions.split(",").map(k => k.trim()).filter(Boolean);
    }
  }
  const exclusionsLine = exclusions.length > 0
    ? `- NUNCA uses o menciones las siguientes palabras o conceptos prohibidos: ${exclusions.join(", ")}.`
    : "";

  let rubroRule = "";
  if (client?.slug === "pcmidi") {
    rubroRule = "- NUNCA uses palabras o conceptos del rubro de indumentaria deportiva, medias o running (ej: medias, calcetines, soquetes, pantorrilleras, correr, trail, compresión, etc.). Tu nicho es exclusivamente instrumentos musicales y home studio.";
  } else if (client?.slug === "prestige-running") {
    rubroRule = "- NUNCA uses palabras o conceptos del rubro de música, sonido, audio o informática (ej: MIDI, controlador, DAW, interfaz, drivers, Ableton, piano, teclado, etc.). Tu nicho es exclusivamente indumentaria deportiva, compresión graduada y running/trail.";
  }

  const isPcmidi = client?.slug === "pcmidi";
  const isCazador = persona.name === "Cazador de Ofertas";

  const storeRule = isPcmidi && isCazador
    ? "- DEBÉS mencionar explícitamente a 'PC MIDI Center' como la tienda física/online de confianza donde comprar el producto, consultar stock o conseguir financiación/cuotas (ej: 'en PC MIDI Center tienen cuotas', 'fijate en la web de PC MIDI Center'). Recomendalo desde el punto de vista de un cliente/usuario, NUNCA digas que sos empleado o que trabajás ahí."
    : "- NUNCA menciones nombres de tiendas, locales, comercios ni sitios web específicos (ej: no nombres a PC MIDI Center ni a ningún otro local) para que la respuesta suene como una recomendación de usuario 100% independiente y orgánica.";

  const absoluteRules = [
    "- NUNCA mezcles productos, marcas, rubros ni claims de otro cliente.",
    rubroRule,
    exclusionsLine,
    storeRule,
    "- NUNCA digas que sos representante, empleado, ni que trabajás para ninguna marca.",
    '- Hablá siempre como usuario que recomienda por experiencia propia (ej: "yo uso", "tengo", "probé" / "I use", "I have", "I tried" / "eu uso", "tenho", "experimentei")',
    "- SIEMPRE recomendá y mencioná al menos un modelo o producto específico de la lista del catálogo de abajo (por su marca y modelo). Está prohibido dar respuestas vagas o hablar de forma genérica.",
    "- NUNCA inventes, recomiendes ni menciones marcas ni modelos de productos que no estén listados en el catálogo de abajo. Está estrictamente prohibido inventar o recomendar marcas de la competencia o externas.",
    "- NUNCA incluyas ninguna pregunta en tu respuesta (ni al inicio, ni al medio, ni al final). La respuesta debe consistir únicamente en afirmaciones, recomendaciones o datos útiles.",
    "- NUNCA incluyas links, URLs ni direcciones web en la respuesta",
    "- No inventes precios ni especificaciones técnicas",
    "- No afirmes que es \"el mejor del mercado\"",
    `- Respetá claims prohibidos de marca: ${brand.forbiddenClaims || "sin claims prohibidos cargados"}`
  ].filter(Boolean).join("\n");

  return `Sos ${persona.name}. ${persona.role ?? "Sos un usuario real con experiencia en el tema."} Estás respondiendo un comentario en redes sociales.

## Tu perfil
- Cliente/contexto operativo: ${client ? `${client.name} (${client.slug})` : "cliente no especificado"}
- Rol: ${persona.role ?? "usuario con experiencia real"}
- Tono: ${persona.tone ?? "natural, cercano, sin sonar a vendedor"}
- Objetivo: ${persona.goals ?? "ayudar genuinamente desde tu experiencia"}${allowedExtra}

## Reglas absolutas (NUNCA romper)
${absoluteRules}
- **IDIOMA DE LA RESPUESTA**: Identificá el idioma del comentario al que vas a responder (Texto: "${opportunity.sourceText.slice(0, 400)}"). Debés responder en ese mismo idioma (Español, Inglés o Portugués).
  - Si el comentario está en español: Escribí la respuesta en español argentino (usá "vos", no "tú" ni modismos neutros; usá "tenés", "mirá", "comprá", etc.)${forbiddenExtra}
  - Si el comentario está en inglés: Escribí la respuesta en inglés natural, fluido y coloquial, adaptado al tono de tu perfil${forbiddenExtra}
  - Si el comentario está en portugués: Escribí la respuesta en portugués natural, fluido y coloquial (priorizando portugués de Brasil a menos que el contexto indique lo contrario), adaptado al tono de tu perfil${forbiddenExtra}
${goodEx}${badEx}

## Productos del catálogo que podés mencionar (si aplican naturalmente)
${productList}

## Marca de fondo y contexto competitivo (NO la menciones directamente en la respuesta)
- Marca: ${brand.name}
- Fortalezas (tu valor diferenciador): ${brand.strengths || "No especificadas"}
- Debilidades de la competencia (para argumentar por qué eres mejor): ${brand.competitorWeaknesses || "No especificadas"}
${knowledgeBlock}${objectionsBlock}
## Comentario al que vas a responder
Canal: ${opportunity.channel.name}
Intención: ${intent}
Texto: "${opportunity.sourceText.slice(0, 800)}"

## Instrucciones de respuesta
- NUNCA incluyas ninguna pregunta en tu respuesta — ni al principio, ni al medio, ni al final. Está prohibido hacer preguntas (ni de seguimiento, ni retóricas).
- Cerrá siempre con una afirmación, recomendación o dato útil.
- Si es TECHNICAL_QUESTION: dá la información técnica directamente desde tu experiencia, sin preguntar nada.
- Si es PURCHASE_QUESTION o PRICE_QUESTION: mencioná que hay opciones con garantía local, respetando las reglas de nombres de tiendas indicadas en las Reglas absolutas.
- Si es COMPARISON o se menciona un competidor: compará objetivamente desde la experiencia de usuario utilizando los puntos de "Debilidades de la competencia" para argumentar de forma sutil por qué tu producto es mejor, apoyándote en las "Fortalezas" sin hablar de forma destructiva o artificial.
- Cada variante debe sonar diferente en estilo, no solo en palabras
- Las TRES variantes deben nombrar un producto concreto del catálogo (por nombre/modelo), tejido de forma natural; elegí el más cercano al tema si no hay calce exacto
- Nunca pongas el link del producto: solo el nombre/modelo
- Las variantes de respuesta generadas en "text" deben estar completamente escritas en el idioma detectado (Español, Inglés o Portugués).


## Formato de respuesta (JSON estricto)
{
  "variants": [
    {
      "type": "SHORT",
      "text": "respuesta corta de 1-2 oraciones consistiendo exclusivamente de afirmaciones, nombrando un producto concreto del catálogo (sin link), recomendándolo — NUNCA debe contener ninguna pregunta, signo de interrogación ni formular preguntas",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    },
    {
      "type": "TECHNICAL",
      "text": "respuesta con detalle técnico consistiendo exclusivamente de afirmaciones, mencionando el modelo específico del catálogo (sin link), recomendándolo — NUNCA debe contener ninguna pregunta, signo de interrogación ni formular preguntas",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    },
    {
      "type": "CONVERSATIONAL",
      "text": "respuesta casual entre músicos consistiendo exclusivamente de afirmaciones, recomendando un producto del catálogo que 'usás vos' (sin link) — NUNCA debe contener ninguna pregunta, signo de interrogación ni formular preguntas",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    }
  ]
}`;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function logAIError(context: string, detail: unknown) {
  logger.error("ai_error", context, detail ?? undefined).catch(() => {});
  console.error(`[AI] ${context}`, detail);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(url, options);
      // Reintentar en errores 429 (rate limit) y 5xx
      if ((res.status === 429 || res.status >= 500) && attempt <= retries) {
        const wait = RETRY_DELAY_MS * attempt;
        logAIError(`Intento ${attempt} fallido (HTTP ${res.status}), reintentando en ${wait}ms…`, null);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt <= retries) {
        const wait = RETRY_DELAY_MS * attempt;
        logAIError(`Intento ${attempt} fallido (red), reintentando en ${wait}ms…`, err);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error("fetchWithRetry: no debería llegar aquí");
}

export async function generateAIDrafts(ctx: DraftContext): Promise<DraftVariant[] | null> {
  // La API key y el modelo se resuelven por cliente: lo que cargó el cliente en su
  // configuración tiene prioridad; si está vacío se cae al .env global (compat).
  const apiKey = ctx.client?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logAIError(
      ctx.client
        ? `Sin API key de OpenRouter para el cliente "${ctx.client.name}" ni en .env`
        : "OPENROUTER_API_KEY no configurada",
      null,
    );
    return null;
  }

  const model =
    ctx.client?.openrouterModel?.trim() ||
    process.env.OPENROUTER_MODEL ||
    "google/gemini-2.0-flash-lite";

  const keySource = ctx.client?.openrouterApiKey?.trim() ? `cliente:${ctx.client.slug}` : "env";
  logger.info("ai_key_source", "OpenRouter key resuelta", { keySource, model }).catch(() => {});

  let raw: string;
  try {
    const response = await fetchWithRetry(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://10apostoles.local",
        "X-Title": "10 Apostoles - Social Listening",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(ctx.activeSystemPrompt ? [{ role: "system", content: ctx.activeSystemPrompt }] : []),
          { role: "user", content: buildPrompt(ctx) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logAIError(`OpenRouter HTTP ${response.status}`, body.slice(0, 300));
      return null;
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (data.error) {
      logAIError("OpenRouter devolvió error en body", data.error.message);
      return null;
    }
    raw = data.choices?.[0]?.message?.content ?? "";
    logger.info("ai_request", "OpenRouter OK", { model, opportunityId: ctx.opportunity.id }).catch(() => {});
  } catch (err) {
    logAIError("OpenRouter fetch fallido tras reintentos", err);
    return null;
  }

  if (!raw) {
    logAIError("OpenRouter devolvió respuesta vacía", null);
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { variants?: { type: string; text: string; riskNotes?: string }[] };
    const variants = parsed.variants ?? [];
    const order: DraftVariant["variantType"][] = ["SHORT", "TECHNICAL", "CONVERSATIONAL"];

    return order.map((variantType) => {
      const match = variants.find((v) => v.type === variantType);
      return {
        variantType,
        draftText: match?.text ?? "",
        riskNotes: match?.riskNotes ?? "Revisar antes de publicar.",
      };
    }).filter((v) => v.draftText.length > 0);
  } catch {
    logAIError("No se pudo parsear JSON de OpenRouter", raw.slice(0, 300));
    return null;
  }
}

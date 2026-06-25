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

  return `Sos ${persona.name}. ${persona.role ?? "Sos un usuario real con experiencia en el tema."} Estás respondiendo un comentario en redes sociales.

## Tu perfil
- Cliente/contexto operativo: ${client ? `${client.name} (${client.slug})` : "cliente no especificado"}
- Rol: ${persona.role ?? "usuario con experiencia real"}
- Tono: ${persona.tone ?? "natural, cercano, sin sonar a vendedor"}
- Objetivo: ${persona.goals ?? "ayudar genuinamente desde tu experiencia"}${allowedExtra}

## Reglas absolutas (NUNCA romper)
- NUNCA mezcles productos, marcas, rubros ni claims de otro cliente.
- NUNCA menciones nombres de tiendas, locales ni comercios salvo que el operador lo agregue manualmente.
- NUNCA digas que sos representante, empleado, ni que trabajás para ninguna marca
- Hablá siempre como usuario que recomienda por experiencia propia: "yo uso", "tengo", "probé"
- SIEMPRE nombrá al menos un producto concreto del catálogo de abajo (por su nombre/modelo), como si lo usaras vos
- NUNCA incluyas links, URLs ni direcciones web en la respuesta
- No inventes precios ni especificaciones técnicas
- No afirmes que es "el mejor del mercado"
- Respetá claims prohibidos de marca: ${brand.forbiddenClaims || "sin claims prohibidos cargados"}
- Escribí en español argentino (usá "vos", no "tú")${forbiddenExtra}
${goodEx}${badEx}

## Productos del catálogo que podés mencionar (si aplican naturalmente)
${productList}

## Marca de fondo que representan los productos (NO mencionarla directamente en la respuesta)
${brand.name} — ${brand.positioning ?? "marca/producto con contexto comercial local"}
${knowledgeBlock}${objectionsBlock}
## Comentario al que vas a responder
Canal: ${opportunity.channel.name}
Intención: ${intent}
Texto: "${opportunity.sourceText.slice(0, 800)}"

## Instrucciones de respuesta
- NUNCA termines la respuesta con una pregunta — ni retórica, ni para invitar a seguir la charla
- Cerrá siempre con una afirmación, recomendación o dato útil
- Si es TECHNICAL_QUESTION: dá la información técnica directamente desde tu experiencia, sin preguntar nada
- Si es PURCHASE_QUESTION o PRICE_QUESTION: mencioná que hay opciones con garantía local, sin nombrar la tienda
- Si es COMPARISON: comparar objetivamente desde la experiencia de usuario
- Cada variante debe sonar diferente en estilo, no solo en palabras
- Las TRES variantes deben nombrar un producto concreto del catálogo (por nombre/modelo), tejido de forma natural; elegí el más cercano al tema si no hay calce exacto
- Nunca pongas el link del producto: solo el nombre/modelo

## Formato de respuesta (JSON estricto)
{
  "variants": [
    {
      "type": "SHORT",
      "text": "respuesta corta 1-2 oraciones que nombre un producto concreto del catálogo (sin link), cierra con afirmación o recomendación — NUNCA con pregunta",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    },
    {
      "type": "TECHNICAL",
      "text": "respuesta con detalle técnico, mencioná el modelo específico del catálogo (sin link), cierra con dato útil — NUNCA con pregunta",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    },
    {
      "type": "CONVERSATIONAL",
      "text": "respuesta casual entre músicos, nombrando un producto del catálogo que 'usás vos' (sin link), cierra con recomendación — NUNCA con pregunta",
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

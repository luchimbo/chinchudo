import type { Brand, CatalogRule, Channel, Client, CompetitorEvidence, Opportunity, Persona, Product } from "@prisma/client";
import { selectRelevantProducts, type ScopedProduct } from "./catalog";
import type { KnowledgeLike, ObjectionLike } from "./knowledge";
import { deriveVoiceModulation, type ProfileContextForDraft } from "./observed-profiles";
import { logger } from "./logger";
import { fetchChatCompletion, resolveLLMConfig, resolveOpenRouterConfig, type LLMConfig } from "./llm-provider";
import { policyInstructions } from "./response-policy";
import { ensureRequiredBrandMention, sanitizePublicDraft, validateDraftForClient } from "./draft-output";

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
  observedProfile?: ProfileContextForDraft | null;
  competitorEvidence?: CompetitorEvidence[];
  avoidDrafts?: string[];
  clientMemories?: { rule: string }[];
  editorialGuidance?: string;
  styleCorrection?: string;
};

type DraftVariant = {
  variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
  draftText: string;
  riskNotes: string;
};

export const COPILOT_MAX_CHARACTERS = 280;

/** Last-resort guardrail: preserve whole words and never return more than the Copilot limit. */
export function shortenCopilotText(text: string, maxLength = COPILOT_MAX_CHARACTERS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const limit = Math.max(1, maxLength - 1);
  const candidate = normalized.slice(0, limit);
  const lastSpace = candidate.lastIndexOf(" ");
  return `${(lastSpace > 20 ? candidate.slice(0, lastSpace) : candidate).trim()}…`;
}

const INTENT_LABELS: Record<string, string> = {
  TECHNICAL_QUESTION: "pregunta técnica (driver, compatibilidad, configuración)",
  PURCHASE_QUESTION: "pregunta de compra (dónde comprar, stock, disponibilidad)",
  PRICE_QUESTION: "consulta de precio",
  WARRANTY_QUESTION: "consulta de garantía o servicio posventa",
  COMPARISON: "comparativa entre productos",
  GENERAL_DISCUSSION: "comentario general / consulta abierta",
};

function intentLabel(intent: string, client?: Client): string {
  if (client?.slug !== "prestige-running") return INTENT_LABELS[intent] ?? intent;
  const prestigeLabels: Record<string, string> = {
    TECHNICAL_QUESTION: "consulta sobre uso, comodidad o características de indumentaria deportiva",
    PURCHASE_QUESTION: "consulta de compra",
    PRICE_QUESTION: "consulta de precio",
    WARRANTY_QUESTION: "consulta de garantía o posventa",
    COMPARISON: "comparativa de productos",
    GENERAL_DISCUSSION: "comentario general / conversación abierta",
  };
  return prestigeLabels[intent] ?? intent;
}

function prestigeChannelStyle(channel: string): string {
  const normalized = channel.toLowerCase();
  if (normalized.includes("instagram") || normalized.includes("tiktok")) {
    return "Instagram/TikTok: usá frases cortas, directas y coloquiales; evitá explicaciones largas o lenguaje de ficha de producto.";
  }
  if (normalized.includes("youtube") || normalized.includes("facebook") || normalized.includes("reddit")) {
    return "YouTube/Facebook/Reddit: mantené cercanía y claridad, con lugar para explicar un dato práctico adicional si está confirmado.";
  }
  return "Adaptá la extensión a la red: claridad y cercanía antes que tecnicismos o lenguaje de catálogo.";
}

function formatProductName(brandName: string, productName: string): string {
  if (brandName.toLowerCase() === "prestige") {
    const publicName = productName
      .replace(/^pack\s*x\s*\d+\s+/i, "")
      .split(/\s+-\s+/)[0]
      .trim();
    return `Prestige Medias ${publicName}`;
  }
  const brand = brandName.toLowerCase();
  const prod = productName.toLowerCase();
  if (prod.includes(brand)) {
    return productName;
  }
  return `${brandName} ${productName}`;
}

function normalizeProductText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasUncataloguedProductCode(text: string, ctx: DraftContext): boolean {
  const allowedProducts = [
    ...(ctx.catalogProducts ?? []).map((product) => product.name),
    ctx.opportunity.detectedProduct?.name ?? "",
  ].filter(Boolean);
  const allowedText = normalizeProductText(allowedProducts.join(" "));

  const midiplusCodePattern = /\b(?:midi\s*plus|midiplus)\s+([a-z]{0,5}[- ]?\d{1,4}[a-z]*)\b/gi;
  const matches = text.matchAll(midiplusCodePattern);

  for (const match of matches) {
    const rawCode = match[1] ?? "";
    const compactCode = normalizeProductText(rawCode).replace(/\s+/g, "");
    const spacedCode = normalizeProductText(rawCode);
    if (compactCode && !allowedText.replace(/\s+/g, "").includes(compactCode) && !allowedText.includes(spacedCode)) {
      return true;
    }
  }

  return false;
}

export function buildPrompt(ctx: DraftContext): string {
  const { opportunity, brand, persona } = ctx;
  const client = ctx.client;
  const product = opportunity.detectedProduct;
  const intent = intentLabel(opportunity.detectedIntent, client);

  const relevant = selectRelevantProducts(opportunity.sourceText, product, 5, {
    catalogProducts: ctx.catalogProducts,
    catalogRules: ctx.catalogRules,
    scoped: !!client,
  });
  const prestigeDirectNeed = /\b(?:roce|rozaduras?|ampollas?|humedad|pies? mojados?|pies? secos?|media ca[nñ]a|soquete|trail|cobertura|tobillo|calzado|zapatillas?)\b/i.test(opportunity.sourceText);
  // En conversaciones generales de running, el catálogo no debe transformar la respuesta en un pitch.
  const primary = client?.slug === "prestige-running" && !prestigeDirectNeed ? undefined : relevant[0];
  const alternatives = primary ? relevant.slice(1) : [];

  const primaryBlock = primary
    ? `### Producto recomendado principal (usalo por defecto en las 3 variantes)\n  - ${formatProductName(primary.marca, primary.nombre)}: ${primary.uso}${primary.especificaciones ? ` | Especificaciones confirmadas: ${primary.especificaciones}` : ""}`
    : "";
  const alternativesBlock = alternatives.length > 0
    ? `### Alternativas reales permitidas (solo si encajan mejor con el comentario)\n${alternatives.map(p => `  - ${formatProductName(p.marca, p.nombre)}: ${p.uso}${p.especificaciones ? ` | Especificaciones confirmadas: ${p.especificaciones}` : ""}`).join("\n")}`
    : "";
  const productList = [primaryBlock, alternativesBlock].filter(Boolean).join("\n") || "  - (sin productos específicos identificados)";
  const allowedProductNames = relevant.map((p) => formatProductName(p.marca, p.nombre)).join("; ");

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

  const memories = ctx.clientMemories ?? [];
  const memoriesBlock = memories.length > 0
    ? `\n## Reglas aprendidas de interacciones anteriores (aplicá siempre que encajen)\n${memories.map((m) => `- ${m.rule}`).join("\n")}\n`
    : "";

  const knowledge = ctx.knowledge ?? [];
  const objections = ctx.objections ?? [];
  const competitorEvidence = ctx.competitorEvidence ?? [];
  const modulation = deriveVoiceModulation(ctx.observedProfile);
  const knowledgeBlock = knowledge.length > 0
    ? `\n## Datos verificados que SÍ podés usar (no inventes nada fuera de esto)\n${knowledge.map((k) => `- ${k.topic}: ${k.content}`).join("\n")}\n`
    : "";
  const objectionsBlock = objections.length > 0
    ? `\n## Objeciones frecuentes y cómo encararlas (guía interna, adaptá a tu voz)\n${objections.map((o) => `- Si plantea "${o.objection}" → ${o.recommendedAnswer}`).join("\n")}\n`
    : "";
  const competitorEvidenceBlock = competitorEvidence.length > 0
    ? `\n## Evidencia competitiva autorizada\n${competitorEvidence.map((item) => `- [${item.id}] ${item.competitorBrand}${item.model ? ` ${item.model}` : ""}: ${item.observation}${item.allowFirstPerson ? " (puede atribuirse a una prueba documentada del equipo)" : ""}`).join("\n")}\n`
    : "";
  const observedProfileBlock = ctx.observedProfile
    ? `\n## Perfil observado de la cuenta externa\n- Tema actual detectado: ${ctx.observedProfile.currentTopic} (confianza ${ctx.observedProfile.currentTopicConfidence})\n- Intereses históricos: ${ctx.observedProfile.historicalPrimaryTopics.join(", ") || "sin suficientes datos"}\n- Tono histórico: ${ctx.observedProfile.toneProfile} (confianza ${ctx.observedProfile.toneConfidence})\n- Señal comercial acumulada: ${ctx.observedProfile.commercialReadiness}/100\n`
    : "";
  const voiceModulationBlock = `\n## Modulación de voz para esta respuesta\n- Estilo aplicado: ${modulation.styleLabel}\n- Entrada: ${modulation.introStyle}\n- Fraseo: ${modulation.phrasingStyle}\n- Cierre: ${modulation.ctaStyle}\n- Guardrail: ${modulation.guardrail}\n`;
  const editorialGuidanceBlock = ctx.editorialGuidance
    ? `\n## Direccion editorial elegida por el community manager\n${ctx.editorialGuidance}\n`
    : "";
  const styleCorrectionBlock = ctx.styleCorrection
    ? `\n## Corrección de estilo requerida\nEl intento anterior fue descartado por este motivo: ${ctx.styleCorrection}. Corregilo sin cambiar el sentido ni agregar información nueva.\n`
    : "";
  const avoidDrafts = (ctx.avoidDrafts ?? []).filter(Boolean).slice(-30);
  const uniquenessBlock = avoidDrafts.length > 0
    ? `\n## Borradores ya utilizados o rechazados\nNo copies, parafrasees de cerca ni reutilices la estructura de estos textos. Redacta desde cero usando detalles concretos del comentario actual:\n${avoidDrafts.map((text, index) => `${index + 1}. "${text.slice(0, 350)}"`).join("\n")}\n`
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
    rubroRule = "- Tu dominio es running, trail, comodidad del pie, roce, humedad, equipamiento e indumentaria deportiva. Anclá la respuesta en ese contexto y usá únicamente los datos y productos autorizados de esta oportunidad.";
  }

  const isPcmidi = client?.slug === "pcmidi";
  const isCazador = persona.name === "Comercial";

  const storeRule = isPcmidi && isCazador
    ? "- DEBÉS mencionar explícitamente a 'PC MIDI Center' como la tienda física/online de confianza donde comprar el producto, consultar stock o conseguir financiación/cuotas (ej: 'en PC MIDI Center tienen cuotas', 'fijate en la web de PC MIDI Center'). Recomendalo desde el punto de vista de un cliente/usuario, NUNCA digas que sos empleado o que trabajás ahí."
    : client?.slug === "prestige-running"
      ? "- No menciones tiendas, locales, comercios ni sitios web específicos."
    : "- NUNCA menciones nombres de tiendas, locales, comercios ni sitios web específicos (ej: no nombres a PC MIDI Center ni a ningún otro local) para que la respuesta suene como una recomendación de usuario 100% independiente y orgánica.";
  const prestigeRecommendationRule = client?.slug === "prestige-running"
    ? "- Para Prestige Medias, validá primero la duda, experiencia, queja, emoción o curiosidad del comentario. Recomendá solo cuando el producto autorizado encaje de forma clara; si no encaja, aportá un consejo útil sin forzar una venta. Si recomendás un producto, nombrá 'Prestige Medias' una sola vez de forma natural, por ejemplo 'las Prestige Medias Tech Basic'. Nunca uses el modelo aislado. La mención de la marca debe quedar integrada al flujo de la respuesta (experiencia o dato concreto); nunca como oración final desconectada tipo 'es una alternativa para considerar'."
    : "";

  const absoluteRules = [
    "- NUNCA mezcles productos, marcas, rubros ni claims de otro cliente.",
    "- El tema principal de la respuesta lo decide el comentario actual, no el historial viejo.",
    rubroRule,
    exclusionsLine,
    storeRule,
    prestigeRecommendationRule,
    client?.slug === "prestige-running"
      ? "- Hablá como un usuario real de Prestige Medias, cercano y con experiencia práctica de running. Podés usar primera persona de manera natural ('yo uso', 'me vienen resultando', 'las estoy usando') porque las cuentas operativas son usuarios reales autorizados. No inventes especificaciones, situaciones extremas ni beneficios médicos."
      : "- Hablá con naturalidad como asesor transparente del rubro; no finjas ser usuario independiente ni inventes una compra, uso o prueba personal.",
    client?.slug === "prestige-running"
      ? "- NUNCA llames al producto 'pack', 'tripack', 'Pack x3', 'x 3' ni 'x3'. La cantidad de pares no es el nombre de la media: nombrá solo el modelo, por ejemplo 'Tech Basic'."
      : "",
    primary
      ? (client?.slug === "prestige-running"
        ? "- Para Prestige Medias, el producto autorizado es contexto, no una obligación de venta. Si responde de forma directa a una necesidad concreta (roce, humedad, cobertura, trail o tipo de media), podés mencionar marca y modelo. Si el comentario es general sobre running, entrenamiento, motivación o salud, mencioná únicamente 'Prestige Medias' de manera casual y en primera persona, sin modelo, ficha técnica ni argumento de venta."
        : "- Recomendá y mencioná el Producto recomendado principal salvo que una alternativa real permitida encaje claramente mejor.")
      : "- No hay un producto autorizado con compatibilidad suficiente: no fuerces una recomendación ni inventes un modelo.",
    `- Productos/modelos autorizados para nombrar en esta respuesta: ${allowedProductNames || "ninguno"}.`,
    "- NUNCA inventes, recomiendes ni menciones marcas ni modelos que no estén en la lista autorizada anterior. Si dudás, usá el Producto recomendado principal.",
    client?.slug === "prestige-running"
      ? "- No pidas talle, modelo, datos personales ni seguimiento. Podés usar como máximo una pregunta retórica o empática que no requiera respuesta; nunca uses una pregunta para recolectar información."
      : "- NUNCA incluyas ninguna pregunta en tu respuesta (ni al inicio, ni al medio, ni al final). La respuesta debe consistir únicamente en afirmaciones, recomendaciones o datos útiles.",
    "- NUNCA incluyas links, URLs ni direcciones web en la respuesta",
    "- No inventes precios ni especificaciones técnicas",
    "- No afirmes que es \"el mejor del mercado\"",
    `- Respetá claims prohibidos de marca: ${brand.forbiddenClaims || "sin claims prohibidos cargados"}`,
    `- Política de libertad controlada: ${policyInstructions(client).text}`
  ].filter(Boolean).join("\n");

  const prestigeIdentity = client?.slug === "prestige-running"
    ? "Sos un usuario real de Prestige Medias, con experiencia práctica de running, trail e indumentaria deportiva."
    : `Sos ${persona.name}. ${persona.role ?? "Sos un usuario real con experiencia en el tema."}`;
  const questionInstruction = client?.slug === "prestige-running"
    ? "- No uses preguntas para pedir datos. Podés usar solo una pregunta retórica o empática que no requiera respuesta."
    : "- NUNCA incluyas ninguna pregunta en tu respuesta — ni al principio, ni al medio, ni al final. Está prohibido hacer preguntas (ni de seguimiento, ni retóricas).";
  const channelStyle = client?.slug === "prestige-running" ? prestigeChannelStyle(opportunity.channel.name) : "";
  const pcmidiComparisonRule = client?.slug === "pcmidi"
    ? "- Si el texto menciona una batería Millenium o un modelo MPS: no elogies automáticamente la marca, pero tampoco inventes fallas. Partí únicamente del problema, experiencia o característica mencionada por el usuario; contrastá soporte local, garantía verificable, repuestos, sensación de pads, ruido, conexiones y uso real solo cuando la información disponible lo respalde. Nunca uses insultos, rumores, absolutos ni afirmaciones generales como 'son malas'."
    : "";

  return `${prestigeIdentity} Estás respondiendo un comentario en redes sociales.

## Tu perfil
- Cliente/contexto operativo: ${client ? `${client.name} (${client.slug})` : "cliente no especificado"}
- Rol: ${persona.role ?? "usuario con experiencia real"}
- Tono: ${persona.tone ?? "natural, cercano, sin sonar a vendedor"}
- Objetivo: ${persona.goals ?? "ayudar genuinamente desde tu experiencia"}${allowedExtra}

## Reglas absolutas (NUNCA romper)
${absoluteRules}
${memoriesBlock}
- **IDIOMA DE LA RESPUESTA**: Identificá el idioma del comentario al que vas a responder (Texto: "${opportunity.sourceText.slice(0, 400)}"). Debés responder en ese mismo idioma (Español, Inglés o Portugués).
  - Si el comentario está en español: Escribí la respuesta en español argentino (usá "vos", no "tú" ni modismos neutros; usá "tenés", "mirá", "comprá", etc.)${forbiddenExtra}
  - Si el comentario está en inglés: Escribí la respuesta en inglés natural, fluido y coloquial, adaptado al tono de tu perfil${forbiddenExtra}
  - Si el comentario está en portugués: Escribí la respuesta en portugués natural, fluido y coloquial (priorizando portugués de Brasil a menos que el contexto indique lo contrario), adaptado al tono de tu perfil${forbiddenExtra}
${goodEx}${badEx}

## Productos autorizados para esta respuesta
${productList}

## Marca de fondo y contexto competitivo (${client?.slug === "prestige-running" ? "podés mencionar Prestige únicamente al integrar un producto autorizado" : "NO la menciones directamente en la respuesta"})
- Marca: ${brand.name}
- Fortalezas (tu valor diferenciador): ${brand.strengths || "No especificadas"}
- Debilidades de la competencia (para argumentar por qué eres mejor): ${brand.competitorWeaknesses || "No especificadas"}
${knowledgeBlock}${objectionsBlock}${competitorEvidenceBlock}${observedProfileBlock}${voiceModulationBlock}${editorialGuidanceBlock}${styleCorrectionBlock}${uniquenessBlock}
## Registro de escritura de internet (obligatorio)
- Escribí como escribe la gente en comentarios reales de redes en Argentina, no como un texto editorial ni un post de LinkedIn.
- NUNCA uses signos de apertura (¡ ni ¿). Solo signos de cierre, y con moderación: como máximo un signo de exclamación o pregunta por respuesta.
- Arrancá respondiendo al punto concreto del comentario. Prohibido arrancar con celebraciones genéricas como "¡Qué bueno que...!", "Felicitaciones por...", "Me encanta que...".
- Prohibidas las moralejas y frases de coach motivacional: "el progreso se construye paso a paso", "lo importante es", "al final del día", "no te olvides de", "escuchá a tu cuerpo", salvo que el comentario pida puntualmente ese consejo.
- Nada de estructura de ficha técnica: no uses dos puntos para introducir enumeraciones ni listes prestaciones ("buen ajuste, secan rápido, no se mueven"). Una idea por oración, como en un comentario real.
- Espejá el registro del comentario: si escriben corto y directo, respondé corto y directo.
- Muletillas rioplatenses con moderación ("mirá", "posta", "che", "igual", "o sea", "yo que vos"): como máximo una por respuesta; mayúsculas y tildes correctas.
- NUNCA copies literalmente frases de estas instrucciones al texto público (ejemplos de frases prohibidas por ser internas: "sin forzar una recomendación", "sin mencionar ni inventar un producto", "sin inventar un modelo").

## Comentario al que vas a responder
Canal: ${opportunity.channel.name}
Intención: ${intent}
Texto: "${opportunity.sourceText.slice(0, 800)}"

## Instrucciones de respuesta
- ${channelStyle}
${questionInstruction}
- Cerrá de forma natural, como cerraría un comentario real: sin moraleja, sin frase de coach y sin remate de venta.
- Si es TECHNICAL_QUESTION: dá la información técnica directamente a partir de los datos confirmados, sin inventar experiencia personal.
- Si es PURCHASE_QUESTION o PRICE_QUESTION: respondé solo con información confirmada y respetá las reglas de nombres de tiendas indicadas en las Reglas absolutas.
- Si es COMPARISON o se menciona un competidor: compará objetivamente desde la experiencia de usuario utilizando los puntos de "Debilidades de la competencia" para argumentar de forma sutil por qué tu producto es mejor, apoyándote en las "Fortalezas" sin hablar de forma destructiva o artificial.
${pcmidiComparisonRule}
- Cada variante debe sonar diferente en estilo, no solo en palabras
- Cada variante debe ser única para esta oportunidad: incorpora detalles concretos del texto original y evita aperturas, estructuras y cierres genéricos repetibles.
- ${client?.slug === "prestige-running" && !prestigeDirectNeed ? "Para Prestige Medias, cada variante debe mencionar 'Prestige Medias' una sola vez como experiencia personal breve, por ejemplo 'yo vengo usando unas medias Prestige y me resultan cómodas para entrenar'. No nombres modelo, tecnología ni beneficios técnicos." : primary ? (client?.slug === "prestige-running" ? "Para Prestige Medias, priorizá una respuesta útil y conversacional. Si hay una necesidad puntual, como máximo UNA variante puede mencionar marca y modelo." : "Las TRES variantes deben nombrar el Producto recomendado principal o una alternativa real permitida, tejido de forma natural.") : "No hay producto autorizado compatible: las variantes deben aportar valor sin mencionar ni inventar un producto."}
- Nunca pongas el link del producto: solo el nombre/modelo
- ${client?.slug === "prestige-running" ? "Para Prestige Medias, podés compartir una experiencia personal breve y creíble en primera persona. Evitá frases de venta, superlativos y claims médicos." : "No afirmes experiencias personales inventadas: evitá 'yo uso', 'yo tengo', 'yo probé' o testimonios de amigos/alumnos salvo que estén expresamente incluidos como evidencia verificada."}
- Nunca copies instrucciones de estilo, etiquetas internas, nombres de campos ni hashtags al texto público.
- ${primary ? (client?.slug === "prestige-running" ? `Solo si una variante requiere una recomendación concreta, integrá ${formatProductName(primary.marca, primary.nombre)} una sola vez. No uses 'pack', 'tripack', 'x3' ni 'x 3'.` : `Cuando recomiendes, nombrá el modelo completo: ${formatProductName(primary.marca, primary.nombre)}.`) : "No hay un producto suficientemente compatible: no fuerces una recomendación ni inventes un modelo."}
- Las variantes de respuesta generadas en "text" deben estar completamente escritas en el idioma detectado (Español, Inglés o Portugués).


## Formato de respuesta (JSON estricto)
{
  "variants": [
    {
      "type": "SHORT",
      "text": "${client?.slug === "prestige-running" ? "respuesta corta de 1-2 oraciones, empática y natural; una pregunta retórica es opcional si no requiere respuesta" : "respuesta corta de 1-2 oraciones, sin preguntas"}, ${primary ? "integrando el producto concreto autorizado del catálogo" : "sin forzar una recomendación porque falta compatibilidad suficiente"}",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    },
    {
      "type": "TECHNICAL",
      "text": "${client?.slug === "prestige-running" ? "respuesta técnica con datos confirmados y tono de corredor cercano, sin claims médicos ni experiencia personal inventada" : "respuesta con detalle técnico consistiendo exclusivamente de afirmaciones"}${primary ? ", integrando el producto específico autorizado del catálogo sin link" : ", sin inventar ni recomendar un modelo"}",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    },
    {
      "type": "CONVERSATIONAL",
      "text": "${client?.slug === "prestige-running" ? "respuesta casual, cercana y específica al comentario, sin fingir uso o prueba personal" : "respuesta casual entre músicos consistiendo exclusivamente de afirmaciones"}${primary ? ", integrando un producto autorizado del catálogo sin link" : ", sin forzar una recomendación"}",
      "riskNotes": "nota interna sobre qué verificar antes de publicar"
    }
  ]
}`;
}

/** A focused prompt for the Copilot: one editable answer, never a set of variants. */
export function buildCopilotPrompt(ctx: DraftContext, condensationOf?: string): string {
  const shared = buildPrompt(ctx);
  const beforeFormat = shared.split("## Formato de respuesta (JSON estricto)")[0]
    .replace(/- Cada variante debe sonar diferente en estilo, no solo en palabras\n/g, "")
    .replace(/- Cada variante debe ser Ãºnica/g, "- La respuesta debe ser única");
  const condensation = condensationOf
    ? `\n## Texto a condensar\n"${condensationOf}"\nConservá solo lo útil y específico; no agregues información nueva.\n`
    : "";
  return `${beforeFormat}
## Instrucciones de respuesta del Copiloto
- Devolvé UNA sola propuesta breve, directa, natural y específica a este comentario.
- Máximo ${COPILOT_MAX_CHARACTERS} caracteres, idealmente una o dos oraciones.
- No expliques tu razonamiento ni ofrezcas alternativas.
${condensation}
## Formato de respuesta (JSON estricto)
{
  "text": "una única respuesta publicable de hasta ${COPILOT_MAX_CHARACTERS} caracteres",
  "riskNotes": "nota interna breve sobre qué verificar antes de publicar"
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

async function fetchRawCompletion(
  llm: LLMConfig,
  payload: Record<string, unknown>,
  title: string,
  client?: Client,
): Promise<{ raw: string; model: string; provider: string } | null> {
  const extract = (data: unknown) =>
    (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";

  const first = await fetchChatCompletion(llm, payload, title, client);
  if (!first.response.ok) {
    const body = await first.response.text();
    logAIError(`LLM HTTP ${first.response.status}`, body.slice(0, 300));
    return null;
  }
  const firstData = await first.response.json() as { error?: { message?: string } };
  if (firstData.error) {
    logAIError("LLM devolvió error en body", firstData.error.message);
    return null;
  }
  let raw = extract(firstData);
  let used = { model: first.config.model, provider: first.config.provider };

  // Ollama "razonador" puede responder 200 con content vacío (se gastó los tokens
  // pensando): en ese caso reintentamos una sola vez con OpenRouter.
  if (!raw && llm.provider === "local") {
    const fallback = resolveOpenRouterConfig(client);
    if (fallback.apiKey) {
      logAIError("Proveedor local devolvió content vacío; reintentando con OpenRouter", null);
      const second = await fetchChatCompletion(fallback, payload, title, client);
      if (second.response.ok) {
        const secondData = await second.response.json() as { error?: { message?: string } };
        if (!secondData.error) {
          raw = extract(secondData);
          used = { model: second.config.model, provider: second.config.provider };
        } else {
          logAIError("OpenRouter devolvió error en body (fallback)", secondData.error.message);
        }
      } else {
        const body = await second.response.text();
        logAIError(`OpenRouter HTTP ${second.response.status} (fallback)`, body.slice(0, 300));
      }
    }
  }
  if (!raw) return null;
  return { raw, ...used };
}

class ValidationRetryError extends Error {
  constructor(public readonly correction: string) {
    super(correction);
  }
}

function buildStyleCorrection(errors: string[]): string {
  const notes: string[] = [];
  if (errors.includes("prestige_missing_brand_mention")) {
    notes.push("Falta integrar la marca Prestige Medias de forma natural dentro del flujo de la respuesta (experiencia o dato concreto en primera persona). No la agregues como oración de cierre desconectada ni como remate de venta.");
  }
  if (errors.includes("internal_instruction")) {
    notes.push("El texto anterior copió frases de las instrucciones internas (por ejemplo 'sin forzar una recomendación'). Las instrucciones son guía para vos, nunca texto visible: reescribí desde cero.");
  }
  if (errors.includes("blocked_language") || errors.includes("unverified_commercial_claim")) {
    notes.push("El texto anterior incluyó lenguaje no permitido o claims comerciales no verificados. Usá solo afirmaciones verificables y lenguaje natural.");
  }
  if (notes.length === 0) {
    notes.push("El texto anterior fue rechazado por las reglas de calidad. Reescribí desde cero con lenguaje natural y específico al comentario.");
  }
  return notes.join(" ");
}

async function attemptAIDrafts(ctx: DraftContext): Promise<DraftVariant[] | null> {
  // La API key y el modelo se resuelven por cliente: lo que cargó el cliente en su
  // configuración tiene prioridad; si está vacío se cae al .env global (compat).
  const llm = resolveLLMConfig(ctx.client);
  const apiKey = llm.apiKey;
  if (!apiKey) {
    logAIError(
      ctx.client
        ? `Sin API key de OpenRouter para el cliente "${ctx.client.name}" ni en .env`
        : `API key de ${llm.provider} no configurada`,
      null,
    );
    return null;
  }

  const model = llm.model;

  const keySource = ctx.client?.openrouterApiKey?.trim() ? `cliente:${ctx.client.slug}` : "env";
  logger.info("ai_key_source", "Configuracion LLM resuelta", { provider: llm.provider, keySource, model }).catch(() => {});

  let raw: string;
  try {
    const completion = await fetchRawCompletion(
      llm,
      {
        model: llm.model,
        messages: [
          ...(ctx.activeSystemPrompt ? [{ role: "system", content: ctx.activeSystemPrompt }] : []),
          { role: "user", content: buildPrompt(ctx) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: llm.provider === "local" ? 4000 : 2000,
        // Modelos locales "razonadores" (gemma/qwen) gastan el presupuesto pensando
        // y devuelven content vacío; desactivamos el thinking en Ollama.
        ...(llm.provider === "local" ? { think: false } : {}),
      },
      "Los 5 Apostoles - Social Listening",
      ctx.client,
    );
    if (!completion) return null;
    raw = completion.raw;
    logger.info("ai_request", "LLM OK", { model: completion.model, provider: completion.provider, opportunityId: ctx.opportunity.id }).catch(() => {});
  } catch (err) {
    logAIError("LLM fetch fallido tras reintentos", err);
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { variants?: { type: string; text: string; riskNotes?: string }[] };
    const variants = parsed.variants ?? [];
    const order: DraftVariant["variantType"][] = ["SHORT", "TECHNICAL", "CONVERSATIONAL"];

    const drafts = order.map((variantType) => {
      const match = variants.find((v) => v.type === variantType);
      return {
        variantType,
        draftText: ensureRequiredBrandMention(sanitizePublicDraft(match?.text ?? ""), ctx.client?.slug),
        riskNotes: match?.riskNotes ?? "Revisar antes de publicar.",
      };
    }).filter((v) => v.draftText.length > 0);

    const hasInvalidProduct = drafts.some((draft) => hasUncataloguedProductCode(draft.draftText, ctx));
    const validationErrors = [...new Set(drafts.flatMap((draft) => validateDraftForClient(draft.draftText, ctx.client?.slug)))];
    if (hasInvalidProduct) {
      logAIError("OpenRouter menciono un codigo de producto fuera del catalogo; usando fallback local", {
        opportunityId: ctx.opportunity.id,
      });
      return null;
    }
    if (validationErrors.length > 0) throw new ValidationRetryError(buildStyleCorrection(validationErrors));

    return drafts;
  } catch (err) {
    if (err instanceof ValidationRetryError) throw err;
    logAIError("No se pudo parsear JSON de OpenRouter", raw.slice(0, 300));
    return null;
  }
}

export async function generateAIDrafts(ctx: DraftContext): Promise<DraftVariant[] | null> {
  try {
    return await attemptAIDrafts(ctx);
  } catch (err) {
    if (!(err instanceof ValidationRetryError)) throw err;
    try {
      return await attemptAIDrafts({ ...ctx, styleCorrection: err.correction });
    } catch (retryErr) {
      if (retryErr instanceof ValidationRetryError) return null;
      throw retryErr;
    }
  }
}

async function requestCopilotDraft(ctx: DraftContext, condensationOf?: string): Promise<DraftVariant | null> {
  const llm = resolveLLMConfig(ctx.client);
  if (!llm.apiKey) return null;
  try {
    const completion = await fetchRawCompletion(llm, {
      model: llm.model,
      messages: [
        ...(ctx.activeSystemPrompt ? [{ role: "system", content: ctx.activeSystemPrompt }] : []),
        { role: "user", content: buildCopilotPrompt(ctx, condensationOf) },
      ],
      response_format: { type: "json_object" },
      temperature: condensationOf ? 0.2 : 0.65,
      max_tokens: llm.provider === "local" ? (condensationOf ? 1000 : 1500) : (condensationOf ? 180 : 360),
      ...(llm.provider === "local" ? { think: false } : {}),
    }, "Los 5 Apostoles - Copiloto CM", ctx.client);
    if (!completion) return null;
    const parsed = JSON.parse(completion.raw) as { text?: string; riskNotes?: string };
    const text = ensureRequiredBrandMention(sanitizePublicDraft(parsed.text ?? ""), ctx.client?.slug);
    if (!text || hasUncataloguedProductCode(text, ctx)) return null;
    const validationErrors = validateDraftForClient(text, ctx.client?.slug);
    if (validationErrors.length > 0) throw new ValidationRetryError(buildStyleCorrection(validationErrors));
    logger.info("ai_request", "LLM Copiloto OK", { model: completion.model, provider: completion.provider, opportunityId: ctx.opportunity.id }).catch(() => {});
    return { variantType: "SHORT", draftText: text, riskNotes: parsed.riskNotes ?? "Revisar antes de publicar." };
  } catch (err) {
    if (err instanceof ValidationRetryError) throw err;
    logAIError("No se pudo generar propuesta del Copiloto", err);
    return null;
  }
}

/** Generates one short Copilot response. If needed, the model gets one chance to condense it before deterministic truncation. */
export async function generateAICopilotDraft(ctx: DraftContext): Promise<DraftVariant | null> {
  let initial: DraftVariant | null;
  let lastCorrection = "";
  try {
    initial = await requestCopilotDraft(ctx);
  } catch (err) {
    if (!(err instanceof ValidationRetryError)) throw err;
    lastCorrection = err.correction;
    try {
      initial = await requestCopilotDraft({ ...ctx, styleCorrection: err.correction });
    } catch (retryErr) {
      if (retryErr instanceof ValidationRetryError) {
        lastCorrection = `${lastCorrection} | reintento: ${retryErr.correction}`;
        initial = null;
      } else {
        throw retryErr;
      }
    }
  }
  if (!initial) {
    logAIError("Copiloto sin propuesta de IA tras reintento; se usará fallback local", { opportunityId: ctx.opportunity.id, correccion: lastCorrection });
    return null;
  }
  if (initial.draftText.length <= COPILOT_MAX_CHARACTERS) return initial;  const condensed = await requestCopilotDraft(ctx, initial.draftText).catch((err: unknown) => {
    if (err instanceof ValidationRetryError) return null;
    throw err;
  });
  const best = condensed?.draftText ? condensed : initial;
  return { ...best, draftText: shortenCopilotText(best.draftText) };
}

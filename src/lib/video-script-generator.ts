import type { Client, ContentIntent, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import {
  DEFAULT_TARGET_SECONDS,
  HOOK_MIN_SCORE,
  SCRIPT_FOCUS_INTENT,
  buildScriptQualityReport,
  candidateFormulas,
  classifyHook,
  composeCaption,
  formulaPromptBlock,
  humanizeText,
  withOnScreenCards,
  readReelCraftMeta,
  type DraftBeat,
  type ScriptQualityReport,
} from "./reel-craft";

type ScriptGenerationContext = {
  contentIdeaId?: string;
  trendId?: string;
  productId?: string;
  personaId: string;
  clientId: string;
  focus?: string;
};

type ScriptDraft = {
  hookOptions: { formulaId: number | null; spoken: string; onScreen: string }[];
  beats: DraftBeat[];
  cta: string;
  caption: string;
  hashtags: string[];
  visualCues: string;
  audioPrompt: string;
  recommendedFormat: string;
  humanizerChanges: number;
  humanizerReplaced: string[];
};

export async function generateVideoScript(ctx: ScriptGenerationContext): Promise<string | null> {
  const { trendId, productId, personaId, clientId, contentIdeaId, focus } = ctx;

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
    : trend ? buildTrendContext(trend) : { taskInstruction: "Escribe un guion basado en el producto.", contextDetail: `1. Enfoque editorial elegido: ${focus || "Mostrar uso"}. Desarrollalo con una estructura clara y grabable.` };

  // Fórmulas de hook (ig-reel): la de la idea o la referencia va primera.
  const intent: ContentIntent = idea?.intent ?? SCRIPT_FOCUS_INTENT[focus || "Mostrar uso"] ?? "USE_CASE";
  const preferredFormula = (idea ? classifyHook(idea.hook)?.id : null) ?? readReelCraftMeta(trend?.metadata).formulaId ?? null;
  const formulas = candidateFormulas(intent, preferredFormula);

  const prompt = `
Actua como redactor experto en guiones para videos cortos verticales (TikTok, Instagram Reels y YouTube Shorts) para ${client.name} en Argentina.

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

4. Formulas de hook a usar (una por opcion, las tres distintas):
${formulaPromptBlock(formulas)}

### ESTRUCTURA DEL REEL
- 0:00-0:02 HOOK: la afirmacion. Linea hablada y tarjeta en pantalla escritas por separado. Movimiento en el primer cuadro.
- 0:02-0:07 LO QUE ESTA EN JUEGO: una linea sobre por que le importa a quien mira.
- CUERPO: una idea por beat; cada beat se dice en 4 segundos o menos y cambia el plano.
- ULTIMOS 3s: cumplir lo que prometio el hook y un solo pedido.
- ULTIMA LINEA: repetir una palabra del hook para que el loop cierre.

### REGLAS
- El resultado sera usado por un operador humano para grabar o editar, no para render automatico.
- No menciones render, avatar, D-ID, FFmpeg, IA de video ni automatizacion.
- Escribe para Argentina con voseo natural si encaja con la persona. Frases cortas, como se dicen.
- Sin saludo, sin "en este video", sin presentacion ni logo: arranca en la frase que normalmente llegaria al segundo seis.
- Hook de 5 a 12 palabras, con algo concreto (modelo, numero, situacion) y algo en juego.
- Tarjetas en pantalla de 6 palabras o menos.
- El guion completo debe durar 20 a 40 segundos (objetivo ${DEFAULT_TARGET_SECONDS}s).
- No inventes stock, precio, garantia, datos tecnicos, metricas, clientes ni claims de superioridad. Si un numero hace falta y no esta en los datos, escribi {{dato}}.
- Nada de "te recomiendo 100%", "el mejor del mercado", "no lo dudes", rayas largas ni emojis en el hook.
- Resuelve una duda o muestra un caso de uso antes de vender.
- Caption: primera linea de menos de 125 caracteres con el pedido, sin saludo ni emoji al inicio. Maximo 5 hashtags, mejor 3, que alguien buscaria.
- Respeta tono, frases prohibidas y claims de marca.
- Todo el texto en español: decí "gancho", "cierre" y "descripcion", nunca "hook", "CTA" ni "caption".
- Devuelve solamente JSON valido.

### JSON REQUERIDO
{
  "hookOptions": [
    { "formulaId": ${formulas[0]?.id ?? 1}, "spoken": "Linea hablada del hook.", "onScreen": "TARJETA CORTA" }
  ],
  "beats": [
    { "spoken": "Una linea hablada por beat, desde lo que esta en juego hasta el payoff.", "onScreen": "Tarjeta opcional" }
  ],
  "cta": "Un solo pedido final que repita una palabra del hook.",
  "caption": "Caption para Instagram.",
  "hashtags": ["hasta", "cinco"],
  "visualCues": "Planos y acciones grabables, con los rotulos Gancho:, Cuerpo: y Cierre:.",
  "audioPrompt": "Audio, ritmo o estilo de edicion sugerido para el operador.",
  "recommendedFormat": "TikTok | Reel | Short, con una razon breve si hace falta."
}
hookOptions debe tener exactamente 3 elementos, uno por formula listada.
`;

  try {
    const first = await requestDraft(llm, client, prompt);
    if (!first) return null;
    let draft = cleanDraft(first);
    let report = reportFor(draft);

    // Un solo reintento con los problemas concretos, como pide ig-reel:
    // si el mejor hook no llega a 50 o la beat sheet tiene flags, se corrige.
    if (!report.ready && (report.hook.score < HOOK_MIN_SCORE || !report.beatSheet?.clean)) {
      const fix = `${prompt}\n### CORRECCION\nEl borrador anterior tuvo estos problemas. Devolve el JSON completo corregido:\n${report.problems.map((problem) => `- ${problem}`).join("\n")}\nBorrador anterior:\n${JSON.stringify(draft)}`;
      const retry = await requestDraft(llm, client, fix);
      if (retry) {
        const cleanRetry = cleanDraft(retry);
        const retryReport = reportFor(cleanRetry);
        if (rank(retryReport) > rank(report)) [draft, report] = [cleanRetry, retryReport];
      }
    }

    const hook = report.hook;
    const bodyBeats = draft.beats.map((beat) => beat.spoken).filter(Boolean);
    const visualCues = withOnScreenCards(draft.visualCues, report.beatSheet);
    const audioPrompt = [draft.audioPrompt, draft.recommendedFormat ? `Formato recomendado: ${draft.recommendedFormat}` : ""].filter(Boolean).join("\n");

    const script = await prisma.videoScript.create({
      data: {
        clientId,
        trendId: trend?.id,
        contentIdeaId: idea?.id,
        brandId: product.brandId,
        productId: product.id,
        personaId,
        hook: hook.spoken,
        bodyText: bodyBeats.join("\n"),
        cta: draft.cta,
        visualCues,
        audioPrompt,
        hookFormula: hook.formulaId ? `#${hook.formulaId} ${hook.formulaName}` : "",
        caption: composeCaption(draft.caption, draft.hashtags),
        qualityReport: report as unknown as Prisma.InputJsonValue,
        status: "NEW",
      },
    });

    console.info("[Script Generator] Guion creado", { scriptId: script.id, hook: hook.score, verdict: hook.verdict, ready: report.ready });
    return script.id;
  } catch (err) {
    console.error(`[Script Generator] Error en llamada a ${llm.provider}:`, err);
    return null;
  }
}

function reportFor(draft: ScriptDraft): ScriptQualityReport {
  const report = buildScriptQualityReport({ hookOptions: draft.hookOptions, beats: [...draft.beats, { spoken: draft.cta }], caption: draft.caption, hashtags: draft.hashtags });
  return { ...report, human: { ...report.human, changes: draft.humanizerChanges, replaced: draft.humanizerReplaced } };
}

/** Pasa todo el texto por el humanizador (ig-human) antes de puntuar y guardar. */
function cleanDraft(draft: ScriptDraft): ScriptDraft {
  let changes = 0;
  const replaced = new Set<string>();
  const clean = (text: string) => {
    const result = humanizeText(text);
    changes += result.changes;
    result.replaced.forEach((entry) => replaced.add(entry));
    return result.text;
  };
  return {
    ...draft,
    hookOptions: draft.hookOptions.map((option) => ({ ...option, spoken: clean(option.spoken), onScreen: clean(option.onScreen) })),
    beats: draft.beats.map((beat) => ({ spoken: clean(beat.spoken), onScreen: beat.onScreen ? clean(beat.onScreen) : undefined })),
    cta: clean(draft.cta),
    caption: clean(draft.caption),
    humanizerChanges: changes,
    humanizerReplaced: Array.from(replaced),
  };
}

function rank(report: ScriptQualityReport): number {
  return report.hook.score - report.problems.length * 5;
}

async function requestDraft(llm: ReturnType<typeof resolveLLMConfig>, client: Client, prompt: string): Promise<ScriptDraft | null> {
  const { response } = await fetchChatCompletion(
    llm,
    {
      messages: [
        {
          role: "system",
          content: "Eres un asistente experto en guiones de redes sociales. Devuelve unicamente JSON valido.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
      max_tokens: 2000,
    },
    "Los 5 Apostoles - Editorial Video Script Generator",
    client,
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Script Generator] ${llm.provider} HTTP ${response.status}:`, errorText);
    return null;
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    console.error("[Script Generator] OpenRouter devolvio contenido vacio.");
    return null;
  }

  try {
    return parseDraft(JSON.parse(content));
  } catch (parseErr) {
    console.error("[Script Generator] JSON invalido devuelto por IA:", content, parseErr);
    return null;
  }
}

/** Acepta el JSON nuevo y también el viejo (hook/bodyText/cta) por si el modelo lo ignora. */
export function parseDraft(parsed: any): ScriptDraft | null {
  const hookOptions = Array.isArray(parsed?.hookOptions)
    ? parsed.hookOptions
        .map((option: any) => ({ formulaId: Number(option?.formulaId) || null, spoken: normalizeField(option?.spoken).trim(), onScreen: normalizeField(option?.onScreen).trim() }))
        .filter((option: { spoken: string }) => option.spoken)
    : parsed?.hook ? [{ formulaId: null, spoken: normalizeField(parsed.hook).trim(), onScreen: "" }] : [];
  const beats: DraftBeat[] = Array.isArray(parsed?.beats)
    ? parsed.beats.map((beat: any) => (typeof beat === "string" ? { spoken: beat.trim() } : { spoken: normalizeField(beat?.spoken).trim(), onScreen: normalizeField(beat?.onScreen).trim() || undefined })).filter((beat: DraftBeat) => beat.spoken)
    : normalizeField(parsed?.bodyText).split(/\r?\n/).map((line) => ({ spoken: line.trim() })).filter((beat) => beat.spoken);
  if (!hookOptions.length || !beats.length) return null;
  return {
    hookOptions,
    beats,
    cta: normalizeField(parsed?.cta).trim(),
    caption: normalizeField(parsed?.caption).trim(),
    hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.map((tag: unknown) => String(tag)).filter(Boolean) : [],
    visualCues: normalizeField(parsed?.visualCues),
    audioPrompt: normalizeField(parsed?.audioPrompt),
    recommendedFormat: normalizeField(parsed?.recommendedFormat),
    humanizerChanges: 0,
    humanizerReplaced: [],
  };
}

function buildTrendContext(trend: NonNullable<Awaited<ReturnType<typeof prisma.trend.findUnique>>>) {
  const meta = readReelCraftMeta(trend.metadata);
  const evidence = [
    meta.formulaName ? `- Formula de hook detectada: #${meta.formulaId} ${meta.formulaName}` : "",
    meta.outlierMultiple ? `- Rendimiento: ${meta.outlierMultiple}x la mediana de su canal${meta.band === "signal" ? " (referencia fuera de serie: copiar la estructura, no el video)" : ""}` : "",
  ].filter(Boolean).join("\n");

  if (trend.platform === "VIRAL_CLONE" || trend.platform === "VIRAL_MARKETING") {
    return {
      taskInstruction:
        "Escribe un guion clonando la estructura, el ritmo y el tipo de gancho de una referencia viral de marketing, adaptandolo al producto y a la persona elegida.",
      contextDetail: `1. Estructura viral:
- Titulo/concepto: ${trend.title}
- Enlace: ${trend.sourceUrl || "N/A"}
- Dinamica original: ${trend.description}
${evidence}`,
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
- Busqueda usada: ${trend.queryUsed || "N/A"}
${evidence}`,
  };
}

function normalizeField(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join("\n");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

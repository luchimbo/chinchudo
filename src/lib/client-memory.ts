import type { PrismaClient, ClientMemory } from "@prisma/client";
import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import { logger } from "./logger";

function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findExistingMemory(
  prisma: PrismaClient,
  clientId: string,
  rule: string
): Promise<ClientMemory | null> {
  const existing = await prisma.clientMemory.findMany({
    where: { clientId, active: true },
  });
  const normalized = normalizeRule(rule);
  return existing.find((m) => normalizeRule(m.rule) === normalized) ?? null;
}

export type ClientMemoryItem = {
  id: string;
  clientId: string;
  rule: string;
  summary: string;
  category: string;
  source: string;
  opportunityId?: string | null;
  responseId?: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function getClientMemories(prisma: PrismaClient, clientId: string) {
  return prisma.clientMemory.findMany({
    where: { clientId, active: true },
    orderBy: { createdAt: "desc" },
  });
}

export type AcceptedExample = { comment: string; response: string };

/** Últimas respuestas que el CM aceptó como correctas desde el chat, para usarlas como ejemplos al generar. */
export async function getAcceptedExamples(
  prisma: PrismaClient,
  params: { clientId: string; brandId?: string; limit?: number }
): Promise<AcceptedExample[]> {
  const rows = await prisma.response.findMany({
    where: {
      acceptedAsCorrectAt: { not: null },
      opportunity: { clientId: params.clientId },
      ...(params.brandId ? { brandId: params.brandId } : {}),
    },
    select: { draftText: true, editedText: true, opportunity: { select: { sourceText: true } } },
    orderBy: { acceptedAsCorrectAt: "desc" },
    take: params.limit ?? 5,
  });
  return rows
    .map((row) => ({ comment: row.opportunity.sourceText, response: row.editedText || row.draftText }))
    .filter((example) => example.response.trim());
}

/** Alta individual (carga manual o feedback). Los aprendizajes de chat usan replaceChatLearnings. */
export async function addClientMemory(
  prisma: PrismaClient,
  params: {
    clientId: string;
    rule: string;
    summary?: string;
    category?: string;
    source?: string;
    opportunityId?: string;
    responseId?: string;
  }
): Promise<ClientMemory | null> {
  const ruleClean = params.rule.trim();
  if (!ruleClean) return null;

  const existing = await findExistingMemory(prisma, params.clientId, ruleClean);
  if (existing) return existing;

  return prisma.clientMemory.create({
    data: {
      clientId: params.clientId,
      rule: ruleClean,
      summary: params.summary?.trim() || ruleClean.slice(0, 80),
      category: params.category?.trim() || "general",
      source: params.source || "chat_refinement",
      opportunityId: params.opportunityId || null,
      responseId: params.responseId || null,
    },
  });
}

export async function deleteClientMemory(prisma: PrismaClient, memoryId: string) {
  return prisma.clientMemory.delete({
    where: { id: memoryId },
  });
}

export type ChatLearning = { rule: string; summary: string; category: string };

const LEARNING_CATEGORIES = new Set(["tone", "warranty", "product", "store", "mistake", "general"]);
const MAX_LEARNINGS = 6;
const MAX_CHAT_CHARACTERS = 12000;

/** Los mensajes del operador van completos; si la conversación es muy larga se acortan las respuestas de la IA. */
function formatChatForExtraction(chatHistory: { sender: string; text: string }[]): string {
  const operatorCharacters = chatHistory.filter((msg) => msg.sender === "user").reduce((total, msg) => total + msg.text.length, 0);
  const assistantMessages = chatHistory.filter((msg) => msg.sender !== "user").length;
  const assistantBudget = assistantMessages > 0
    ? Math.max(300, Math.floor((MAX_CHAT_CHARACTERS - operatorCharacters) / assistantMessages))
    : 0;
  return chatHistory
    .map((msg, index) => msg.sender === "user"
      ? `[${index + 1}] Operador: ${msg.text}`
      : `[${index + 1}] IA: ${msg.text.length > assistantBudget ? `${msg.text.slice(0, assistantBudget)}…` : msg.text}`)
    .join("\n");
}

/** Extrae todos los aprendizajes durables de la conversación completa, no solo el último pedido. */
export async function extractLearningsFromChat(params: {
  opportunityText: string;
  finalResponseText: string;
  chatHistory: { sender: string; text: string }[];
  brandName?: string;
}): Promise<ChatLearning[]> {
  if (!params.chatHistory || params.chatHistory.length === 0) return [];

  const llmConfig = resolveLLMConfig();
  const prompt = `Analizá la conversación COMPLETA de refinamiento entre un Operador humano (community manager) y la IA para la marca/cliente "${params.brandName ?? "General"}".

Comentario original que se estaba respondiendo:
"${params.opportunityText}"

Respuesta final aprobada:
"${params.finalResponseText}"

Conversación completa (en orden):
${formatChatForExtraction(params.chatHistory)}

INSTRUCCIÓN:
Recorré TODOS los mensajes del Operador, del primero al último. Cada corrección, dato o preferencia que sirva para responder mejor en el futuro es un aprendizaje separado. No te quedes solo con el último pedido.

Buscá especialmente:
- Tono y estilo (ej. "Escribir informal, como una persona hablando, sin sonar a manual").
- Datos de la tienda o la marca (ej. "La tienda es PC MIDI Center; MIDIPLUS es una marca, no la tienda").
- Criterio de recomendación (ej. "Recomendar solo productos que resuelvan la necesidad concreta del comentario"; "Priorizar un producto propio del catálogo que resuelva el problema antes que una solución genérica").
- Datos de producto confirmados por el Operador (ej. "El Synido TempoKey W25 incluye adaptador para conectarse a cualquier celular: recomendarlo cuando pregunten cómo conectar un teclado al celular").
- Errores que la IA cometió y no debe repetir.

Reglas para redactar:
- Cada aprendizaje debe servir para otras respuestas, pero conservá los nombres concretos de productos, marcas y tiendas.
- Indicá en qué situación aplica cuando haga falta (ej. "cuando pregunten por conectar al celular…").
- Ignorá ajustes que solo valen para este comentario puntual y los saludos.
- No repitas el mismo aprendizaje con otras palabras. Máximo ${MAX_LEARNINGS}.
- Si no hay nada durable, devolvé la lista vacía.

Formato de respuesta (JSON estricto):
{
  "learnings": [
    {
      "rule": "regla clara y accionable para futuras respuestas",
      "summary": "resumen muy corto (máximo 6 palabras)",
      "category": "tone" | "warranty" | "product" | "store" | "mistake" | "general"
    }
  ]
}`;

  try {
    const { response: res } = await fetchChatCompletion(llmConfig, {
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
    }, "10 Apostoles - Chat Memory Extraction");

    if (!res.ok) {
      const errText = await res.text();
      logger.error("memory_extraction_failed", `HTTP ${res.status}: ${errText.slice(0, 200)}`).catch(() => { });
      return [];
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const rawContent = data.choices?.[0]?.message?.content ?? "";
    if (!rawContent) return [];

    const parsed = JSON.parse(rawContent) as { learnings?: { rule?: string; summary?: string; category?: string }[] };
    const seen = new Set<string>();
    return (Array.isArray(parsed.learnings) ? parsed.learnings : [])
      .flatMap((item) => {
        const rule = item?.rule?.trim();
        if (!rule || seen.has(normalizeRule(rule))) return [];
        seen.add(normalizeRule(rule));
        const category = item.category?.trim() ?? "";
        return [{
          rule,
          summary: item.summary?.trim() || rule.slice(0, 40),
          category: LEARNING_CATEGORIES.has(category) ? category : "general",
        }];
      })
      .slice(0, MAX_LEARNINGS);
  } catch (err) {
    logger.error("memory_extraction_error", "Error parseando o ejecutando extracción de memoria", err).catch(() => { });
  }

  return [];
}

/**
 * Reemplaza los aprendizajes de chat de una respuesta por los extraídos de la conversación completa.
 * Si se sigue chateando y se vuelve a aceptar, no quedan reglas viejas ni duplicadas.
 */
export async function replaceChatLearnings(
  prisma: PrismaClient,
  params: { clientId: string; opportunityId: string; responseId: string; learnings: ChatLearning[] }
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.clientMemory.deleteMany({ where: { responseId: params.responseId, source: "chat_refinement" } });
    const existing = await tx.clientMemory.findMany({ where: { clientId: params.clientId, active: true }, select: { rule: true } });
    const known = new Set(existing.map((memory) => normalizeRule(memory.rule)));
    for (const learning of params.learnings) {
      const normalized = normalizeRule(learning.rule);
      if (known.has(normalized)) continue;
      known.add(normalized);
      await tx.clientMemory.create({
        data: {
          clientId: params.clientId,
          rule: learning.rule,
          summary: learning.summary,
          category: learning.category,
          source: "chat_refinement",
          opportunityId: params.opportunityId,
          responseId: params.responseId,
        },
      });
    }
    return params.learnings.map((learning) => learning.rule);
  });
}

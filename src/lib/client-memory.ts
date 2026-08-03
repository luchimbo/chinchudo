import type { PrismaClient, ClientMemory } from "@prisma/client";
import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import { logger } from "./logger";

function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

  // Aprobar y publicar pueden ocurrir como acciones separadas sobre la misma
  // respuesta. Un solo aprendizaje automático por respuesta es suficiente.
  if (params.source === "chat_refinement" && params.responseId) {
    const existingForResponse = await prisma.clientMemory.findFirst({
      where: {
        responseId: params.responseId,
        source: "chat_refinement",
      },
    });
    if (existingForResponse) return existingForResponse;
  }

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

export async function extractLearningFromChat(params: {
  opportunityText: string;
  finalResponseText: string;
  chatHistory: { sender: string; text: string }[];
  brandName?: string;
}): Promise<{ rule: string; summary: string; category: string } | null> {
  if (!params.chatHistory || params.chatHistory.length === 0) {
    return null;
  }

  const llmConfig = resolveLLMConfig();
  const formattedChat = params.chatHistory
    .map((msg) => `${msg.sender === "user" ? "Operador" : "IA"}: ${msg.text}`)
    .join("\n");

  const prompt = `Analizá la siguiente conversación de refinamiento de respuesta entre un Operador humano y la IA para la marca/cliente "${params.brandName ?? "General"}".

Comentario original: "${params.opportunityText.slice(0, 400)}"
Respuesta final aprobada: "${params.finalResponseText.slice(0, 400)}"

Conversación sostenida:
${formattedChat}

INSTRUCCIÓN:
Extraé la REGLA O PREFERENCIA APRENDIDA que el usuario exigió o indicó en el chat para aplicar a futuras respuestas de este cliente.
Ejemplos de reglas:
- "No usar adjetivos inflados como 'excelente' o 'genial'."
- "Para preguntas de garantía, recalcar siempre los 6 meses de soporte técnico local en Palermo."
- "Mencionar opción de cuotas al sugerir la tienda PC MIDI Center."
- "Escribir siempre en tono directo de máximo 2 oraciones."

Si en el chat no hubo ninguna indicación o preferencia duradera clara (solo ajustes menores o saludos), respondé únicamente con JSON { "hasLearning": false }.

Formato de respuesta (JSON estricto):
{
  "hasLearning": true,
  "rule": "descripción detallada y clara de la regla aprendida para aplicar en el futuro",
  "summary": "resumen muy corto (máximo 6 palabras)",
  "category": "tone" | "warranty" | "product" | "store" | "general"
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
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const rawContent = data.choices?.[0]?.message?.content ?? "";
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent) as {
      hasLearning?: boolean;
      rule?: string;
      summary?: string;
      category?: string;
    };

    if (parsed.hasLearning && parsed.rule) {
      return {
        rule: parsed.rule.trim(),
        summary: parsed.summary?.trim() || parsed.rule.trim().slice(0, 40),
        category: parsed.category?.trim() || "general",
      };
    }
  } catch (err) {
    logger.error("memory_extraction_error", "Error parseando o ejecutando extracción de memoria", err).catch(() => { });
  }

  return null;
}

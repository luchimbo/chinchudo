"use server";
import { detectOpportunityLanguage } from "@/lib/opportunity-language";
import { optimizedLoading, manualCMQueue } from "@/lib/performance-flags";
import { assertCurrentCMResponse, claimYouTubePublication, clearYouTubePublication, markYouTubePublicationAmbiguous } from "@/lib/cm-action-guard";

import { closeSiblingOpportunities } from "@/lib/publish-agent";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess, resolveClientForSlug } from "@/lib/auth";
import { requireOwnedClientId } from "@/lib/auth-guards";
import { shortenCopilotText } from "@/lib/ai-draft-generator";
import { COPILOT_MAX_CHARACTERS, COPILOT_TARGET_CHARACTERS } from "@/lib/copilot-limits";
import { sanitizeCopilotDraft } from "@/lib/draft-output";
import { formatPublicProductName, normalizeGeneratedProductMentions, validateGeneratedProductBrands } from "@/lib/product-public-name";
import { OpportunityStatus, OpportunityPriority, OpportunityIntent } from "@prisma/client";
import { logger } from "@/lib/logger";
import { resolveOpportunityClient } from "@/lib/client-context";
import { resolveCatalogBrand } from "@/lib/brand-identity";
import { authorFromUrl } from "@/lib/source-author";
import { recordObservedProfileEvent } from "@/lib/observed-profiles";
import { chatRefinementStep, expandChatForModel, type ChatMessage } from "@/lib/refine-draft";
import { addClientMemory, deleteClientMemory, extractLearningsFromChat, getAcceptedExamples, getClientMemories, replaceChatLearnings } from "@/lib/client-memory";
import { publishYouTubeComment } from "@/lib/youtube-publisher";
import { assertOperationalOpportunityChannel } from "@/lib/opportunity-channels";

const createOpportunitySchema = z.object({
  channelId: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceAuthor: z.string().max(120).optional(),
  sourceText: z.string().min(10).max(4000),
  detectedBrandId: z.string().optional(),
  detectedProductId: z.string().optional(),
  detectedIntent: z.nativeEnum(OpportunityIntent),
  priority: z.nativeEnum(OpportunityPriority),
  notes: z.string().max(2000).optional()
});

export async function createOpportunity(formData: FormData) {
  const parsed = createOpportunitySchema.parse({
    channelId: formData.get("channelId"),
    sourceUrl: formData.get("sourceUrl"),
    sourceAuthor: formData.get("sourceAuthor") || "",
    sourceText: formData.get("sourceText"),
    detectedBrandId: formData.get("detectedBrandId") || undefined,
    detectedProductId: formData.get("detectedProductId") || undefined,
    detectedIntent: formData.get("detectedIntent"),
    priority: formData.get("priority"),
    notes: formData.get("notes") || ""
  });

  const clientSlug = formData.get("client") as string | null;
  const clientObj = clientSlug ? await resolveClientForSlug(prisma, clientSlug) : null;
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: parsed.channelId }, select: { name: true } });
  assertOperationalOpportunityChannel(channel.name);
  if (!parsed.sourceAuthor) parsed.sourceAuthor = authorFromUrl(channel.name, parsed.sourceUrl)?.name ?? "";

  await prisma.opportunity.create({
    data: {
      ...parsed,
      clientId: clientObj?.id || null,
      detectedBrandId: parsed.detectedBrandId || null,
      detectedProductId: parsed.detectedProductId || null,
      language: detectOpportunityLanguage(parsed.sourceText),
      status: OpportunityStatus.NEW
    }
  }).then(async (opportunity) => {
    if (!clientObj) return;
    await recordObservedProfileEvent(prisma, {
      opportunityId: opportunity.id,
      clientId: clientObj.id,
      platform: "manual",
      sourceAuthor: parsed.sourceAuthor || "",
      sourceText: parsed.sourceText,
      sourceUrl: parsed.sourceUrl,
      detectedIntent: parsed.detectedIntent,
      priority: parsed.priority,
      createdAt: opportunity.createdAt,
    });
  });

  revalidatePath("/oportunidades");
  redirect(clientSlug ? `/oportunidades?client=${clientSlug}` : "/oportunidades");
}

const idSchema = z.string().min(1);

const copilotResponseSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  editedText: z.string().min(3).max(COPILOT_MAX_CHARACTERS),
  wasEdited: z.enum(["true", "false"]).default("false"),
  chatHistory: z.unknown().optional(),
});

export async function markCopilotResponse(formData: FormData) {
  const parsed = copilotResponseSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    editedText: formData.get("editedText"),
    wasEdited: formData.get("wasEdited") || "false",
    chatHistory: formData.has("chatHistory") ? JSON.parse(String(formData.get("chatHistory"))) : undefined,
  });
  const chatHistory = parsed.chatHistory === undefined ? undefined : chatMessageSchema.parse(parsed.chatHistory);
  const [response, opportunity] = await Promise.all([
    prisma.response.findUniqueOrThrow({
      where: { id: parsed.responseId },
      select: { opportunityId: true },
    }),
    prisma.opportunity.findUniqueOrThrow({
      where: { id: parsed.opportunityId },
      select: { clientId: true, contextAssessment: true, channel: { select: { name: true } } },
    }),
  ]);
  if (response.opportunityId !== parsed.opportunityId) {
    throw new Error("La respuesta no corresponde a esta oportunidad.");
  }
  assertOperationalOpportunityChannel(opportunity.channel.name);
  await requireOwnedClientId(opportunity.clientId);
  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object" && !Array.isArray(opportunity.contextAssessment)
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};
  const currentCopilot = currentContext.copilot && typeof currentContext.copilot === "object"
    ? currentContext.copilot as Record<string, unknown>
    : {};
  await prisma.$transaction(async (tx) => {
    const archived = await tx.opportunity.updateMany({
      where: { id: parsed.opportunityId, status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] } },
      data: {
        status: OpportunityStatus.ARCHIVED,
        contextAssessment: {
          ...currentContext,
          copilot: {
            ...currentCopilot,
            responseId: parsed.responseId,
            respondedAt: new Date().toISOString(),
            wasEdited: parsed.wasEdited === "true",
          },
        },
      },
    });
    if (archived.count !== 1) throw new Error("Esta oportunidad ya fue respondida o dejó de estar abierta.");
    await tx.response.updateMany({
      where: { opportunityId: parsed.opportunityId, id: { not: parsed.responseId } },
      data: { isPrimary: false },
    });
    await tx.response.update({
      where: { id: parsed.responseId },
      data: { editedText: parsed.editedText, approvedBy: "CM", isPrimary: true, ...(chatHistory ? { chatHistory } : {}) },
    });
  });
  if (!optimizedLoading()) revalidatePath("/asistente-cm");
  revalidatePath("/historial");
  try {
    await learnFromRefinementChat(parsed.responseId, parsed.editedText);
  } catch (error) {
    logger.error("copilot_archive_learning_failed", "No se pudo extraer el aprendizaje del chat", error).catch(() => { });
  }
}

/** Google rechazó la conexión OAuth: sólo se arregla volviendo a autorizar la cuenta. */
function needsYouTubeReconnect(error: string): boolean {
  return error === "youtube_not_connected" || /token has been expired or revoked|invalid_grant|invalid_token/i.test(error);
}

const copilotYouTubePublishSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  editedText: z.string().min(3).max(COPILOT_MAX_CHARACTERS),
  account: z.string().min(1).max(120),
  wasEdited: z.enum(["true", "false"]).default("false"),
  chatHistory: z.unknown().optional(),
});

/** Publicación oficial desde el Copiloto: aprueba y publica en una sola acción. */
export async function publishCopilotYouTubeResponse(formData: FormData) {
  const parsed = copilotYouTubePublishSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    editedText: formData.get("editedText"),
    account: formData.get("account"),
    wasEdited: formData.get("wasEdited") || "false",
    chatHistory: formData.has("chatHistory") ? JSON.parse(String(formData.get("chatHistory"))) : undefined,
  });
  const chatHistory = parsed.chatHistory === undefined ? undefined : chatMessageSchema.parse(parsed.chatHistory);

  const [opportunity, response] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: parsed.opportunityId },
      include: { channel: true },
    }),
    prisma.response.findUniqueOrThrow({ where: { id: parsed.responseId } }),
  ]);
  if (response.opportunityId !== opportunity.id) throw new Error("La respuesta no corresponde a esta oportunidad.");
  assertOperationalOpportunityChannel(opportunity.channel.name);
  if (!opportunity.clientId) throw new Error("La oportunidad debe pertenecer a un cliente antes de publicar.");
  await assertClientAccess(prisma, opportunity.clientId);
  if (opportunity.channel.name.toLowerCase() !== "youtube") throw new Error("Este botón solo publica oportunidades de YouTube.");
  if (["ARCHIVED", "PUBLISHED", "CONVERTED", "FOLLOW_UP"].includes(opportunity.status)) {
    return { success: false as const, message: "Esta oportunidad ya fue respondida.", reconnectRequired: false };
  }

  if (opportunity.contextAssessment && typeof opportunity.contextAssessment === "object" && !Array.isArray(opportunity.contextAssessment) && opportunity.contextAssessment.cmPublicationPending === true) {
    return { success: false as const, message: "Hay un envío pendiente de comprobación. Revisá el comentario en YouTube antes de volver a intentar.", reconnectRequired: false, verificationRequired: true };
  }
  // El envío explícito del operador aprueba el texto editado, aunque la propuesta
  // use reglas o contexto anteriores. Actualizarla es opcional.

  const publicationAttempt = await claimYouTubePublication(prisma, opportunity.clientId, opportunity.id);
  if (!publicationAttempt) {
    return { success: false as const, message: "Hay un envío pendiente de comprobación. Revisá el comentario en YouTube antes de volver a intentar.", reconnectRequired: false, verificationRequired: true };
  }
  const result = await publishYouTubeComment({
    prisma,
    clientId: opportunity.clientId,
    account: parsed.account,
    sourceUrl: opportunity.sourceUrl,
    text: parsed.editedText,
  });
  if (!result.success) {
    console.error(`[publishCopilotYouTubeResponse] YouTube rechazó la publicación de ${opportunity.id}: ${result.error}`);
    if (result.ambiguous) await markYouTubePublicationAmbiguous(prisma, opportunity.clientId, opportunity.id, publicationAttempt);
    else await clearYouTubePublication(prisma, opportunity.clientId, opportunity.id, publicationAttempt);
    const reconnectRequired = needsYouTubeReconnect(result.error);
    return {
      success: false as const,
      verificationRequired: Boolean(result.ambiguous),
      message: result.ambiguous ? "YouTube no confirmó el resultado. Revisá si el comentario se publicó antes de volver a intentar." : reconnectRequired
        ? "La conexión de YouTube venció o fue revocada. Reconectá la cuenta y volvé a publicar este comentario."
        : `No se pudo publicar en YouTube: ${result.error}`,
      reconnectRequired,
    };
  }

  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};
  const currentCopilot = currentContext.copilot && typeof currentContext.copilot === "object"
    ? currentContext.copilot as Record<string, unknown>
    : {};
  await prisma.$transaction([
    prisma.response.updateMany({ where: { opportunityId: opportunity.id, id: { not: response.id } }, data: { isPrimary: false } }),
    prisma.response.update({ where: { id: response.id }, data: { editedText: parsed.editedText, approvedBy: "CM", isPrimary: true, ...(chatHistory ? { chatHistory } : {}) } }),
    prisma.publishingLog.upsert({
      where: { responseId: response.id },
      update: { account: parsed.account, publishedUrl: result.url, remoteId: result.remoteId, publishMethod: result.method, result: result.method, followUpNeeded: false },
      create: { opportunityId: opportunity.id, responseId: response.id, account: parsed.account, publishedUrl: result.url, remoteId: result.remoteId, publishMethod: result.method, result: result.method, followUpNeeded: false },
    }),
    prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
        status: OpportunityStatus.PUBLISHED,
        contextAssessment: {
          ...currentContext,
          copilot: { ...currentCopilot, responseId: response.id, respondedAt: new Date().toISOString(), wasEdited: parsed.wasEdited === "true" },
        },
      },
    }),
  ]);
  await closeSiblingOpportunities(prisma, opportunity.id, opportunity.channelId, opportunity.sourceUrl, opportunity.sourceAuthor);
  try {
    await learnFromRefinementChat(response.id, parsed.editedText);
  } catch (error) {
    logger.error("copilot_publish_learning_failed", "No se pudo extraer el aprendizaje del chat", error).catch(() => { });
  }
  if (!optimizedLoading()) revalidatePath("/asistente-cm");
  revalidatePath("/historial");
  return { success: true as const };
}

/** The operator must inspect YouTube; this action never sends a comment. */
export async function confirmYouTubeNotPublished(formData: FormData) {
  if (formData.get("verifiedNotPublished") !== "true") throw new Error("Revisá primero el comentario en YouTube.");
  const id = z.string().min(1).parse(formData.get("opportunityId"));
  const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { clientId: true, status: true } });
  const client = await requireOwnedClientId(opportunity.clientId);
  if (!["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"].includes(opportunity.status)) throw new Error("La oportunidad ya no está abierta.");
  if (!await clearYouTubePublication(prisma, client.id, id)) return { success: false, message: "El envío todavía puede estar en curso. Esperá dos minutos y volvé a comprobarlo." };
  return { success: true, message: "Comprobación guardada." };
}

const copilotDiscardSchema = z.object({
  opportunityId: z.string().min(1),
  reason: z.enum(["NO_RELEVANTE", "NO_ES_EL_TONO", "FALTA_INFO", "NO_CONVIENE"]).optional(),
});

export async function discardCopilotOpportunity(formData: FormData) {
  const parsed = copilotDiscardSchema.parse({
    opportunityId: formData.get("opportunityId"),
    reason: formData.get("reason") || undefined,
  });
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    select: { contextAssessment: true, clientId: true },
  });
  await requireOwnedClientId(opportunity.clientId);
  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};

  const discarded = await prisma.opportunity.updateMany({
    where: { id: parsed.opportunityId, status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] } },
    data: {
      status: OpportunityStatus.DISCARDED,
      contextAssessment: {
        ...currentContext,
        copilot: {
          ...(currentContext.copilot && typeof currentContext.copilot === "object" ? currentContext.copilot : {}),
          discardedReason: parsed.reason ?? "NO_RELEVANTE",
          discardedAt: new Date().toISOString(),
        },
      },
    },
  });
  if (discarded.count !== 1) throw new Error("Esta oportunidad ya no está abierta.");
  if (!optimizedLoading()) revalidatePath("/asistente-cm");
}

const updateStatusSchema = z.object({
  opportunityId: z.string().min(1),
  status: z.nativeEnum(OpportunityStatus)
});

export async function updateOpportunityStatus(formData: FormData) {
  const parsed = updateStatusSchema.parse({
    opportunityId: formData.get("opportunityId"),
    status: formData.get("status")
  });
  const existing = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    select: { clientId: true },
  });
  await requireOwnedClientId(existing.clientId);

  await prisma.opportunity.update({
    where: { id: parsed.opportunityId },
    data: { status: parsed.status }
  });

  revalidatePath("/");
}

export async function updateClientAutoSettings(clientId: string, autoApprove: boolean, autoPublish: boolean) {
  const client = await requireOwnedClientId(clientId);
  await prisma.client.update({
    where: { id: client.id },
    data: { autoApprove, autoPublish },
  });
  revalidatePath("/");
}

const chatMessageSchema = z.array(
  z.object({
    sender: z.enum(["user", "assistant"]),
    text: z.string(),
    timestamp: z.string().optional(),
    // Propuesta editable del chat: sin este campo el zod la descartaría al guardar.
    suggestion: z.object({ text: z.string().max(4000), original: z.string().max(4000) }).optional(),
  })
);

/** El Asistente CM apunta a COPILOT_TARGET_CHARACTERS y acepta hasta COPILOT_MAX_CHARACTERS; el flujo clásico no tiene tope. */
function refinementMaxCharacters(contextAssessment: unknown) {
  return contextAssessment && typeof contextAssessment === "object" && "copilot" in contextAssessment ? COPILOT_MAX_CHARACTERS : undefined;
}

function refinementTargetCharacters(contextAssessment: unknown) {
  return refinementMaxCharacters(contextAssessment) ? COPILOT_TARGET_CHARACTERS : undefined;
}

function refinementProductChosenByCm(contextAssessment: unknown, productId: string | null) {
  if (!productId || !contextAssessment || typeof contextAssessment !== "object" || !("draftProductChoice" in contextAssessment)) return false;
  const choice = contextAssessment.draftProductChoice;
  return !!choice && typeof choice === "object" && "productId" in choice && "chosenByCm" in choice
    && choice.productId === productId && choice.chosenByCm === true;
}

const sendRefinementMessageSchema = z.object({
  responseId: z.string().min(1),
  userMessage: z.string().min(1).max(2000),
  chatHistory: chatMessageSchema.default([]),
  // Lo que el CM tiene en pantalla, aunque todavía no esté guardado.
  currentText: z.string().max(4000).optional(),
});

export async function sendRefinementMessageAction(formData: FormData) {
  const rawHistory = formData.get("chatHistory");
  let chatHistory: ChatMessage[] = [];
  try {
    chatHistory = rawHistory ? JSON.parse(rawHistory as string) : [];
  } catch {
    chatHistory = [];
  }

  const parsed = sendRefinementMessageSchema.parse({
    responseId: formData.get("responseId"),
    userMessage: formData.get("userMessage"),
    chatHistory,
    currentText: (formData.get("currentText") as string | null) || undefined,
  });

  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    include: {
      opportunity: { include: { channel: true, detectedProduct: { include: { brand: true } } } },
      brand: true,
      persona: true,
    },
  });

  const resolution = await resolveOpportunityClient(prisma, response.opportunity);
  await assertClientAccess(prisma, resolution.client.id);
  const [clientMemories, acceptedExamples] = await Promise.all([
    getClientMemories(prisma, resolution.client.id, { brandId: response.brandId, productId: response.opportunity.detectedProductId }),
    getAcceptedExamples(prisma, { clientId: resolution.client.id, brandId: response.brandId, limit: 5 }),
  ]);

  // El navegador ya agregó el mensaje nuevo al historial para mostrarlo de inmediato.
  // El modelo lo recibe una sola vez, mientras el historial completo se persiste.
  const historyForModel = parsed.chatHistory.at(-1)?.sender === "user" && parsed.chatHistory.at(-1)?.text === parsed.userMessage
    ? parsed.chatHistory.slice(0, -1)
    : parsed.chatHistory;
  const chatProduct = response.opportunity.detectedProduct
    ? { nombre: response.opportunity.detectedProduct.name, marca: response.opportunity.detectedProduct.brand?.name ?? resolveCatalogBrand(response.opportunity.detectedProduct.name) ?? response.brand.name }
    : null;
  const nameContext = {
    sourceText: `${response.opportunity.sourceText}\n${parsed.userMessage}`,
    productChosenByCm: refinementProductChosenByCm(response.opportunity.contextAssessment, response.opportunity.detectedProductId),
  };
  const assistantReply = await chatRefinementStep({
    acceptedExamples,
    opportunityText: response.opportunity.sourceText,
    currentResponseText: parsed.currentText?.trim() || response.editedText || response.draftText,
    chatHistory: historyForModel,
    userMessage: parsed.userMessage,
    brandName: chatProduct?.marca ?? response.brand.name,
    productName: chatProduct ? formatPublicProductName(chatProduct, nameContext) : undefined,
    personaName: response.persona.name,
    clientName: resolution.client.name,
    llmClient: resolution.client,
    clientMemories: clientMemories.map((m) => ({ rule: m.rule })),
    maxCharacters: refinementMaxCharacters(response.opportunity.contextAssessment),
    targetCharacters: refinementTargetCharacters(response.opportunity.contextAssessment),
  });

  const currentTurn: ChatMessage[] = historyForModel.length === parsed.chatHistory.length
    ? [...parsed.chatHistory, { sender: "user", text: parsed.userMessage, timestamp: new Date().toISOString() }]
    : parsed.chatHistory;
  const normalizedSuggestion = assistantReply.suggestion
    ? normalizeGeneratedProductMentions(assistantReply.suggestion, chatProduct ? [chatProduct] : [], nameContext)
    : null;
  if (normalizedSuggestion && chatProduct && validateGeneratedProductBrands(normalizedSuggestion, [chatProduct]).length > 0) {
    throw new Error("La propuesta mezcla la marca con un modelo de otro fabricante. Rehacé la respuesta antes de aplicarla.");
  }
  const suggestion = normalizedSuggestion && refinementMaxCharacters(response.opportunity.contextAssessment)
    ? shortenCopilotText(sanitizeCopilotDraft(normalizedSuggestion, resolution.client.slug)) || null
    : normalizedSuggestion;
  const completedChat: ChatMessage[] = [...currentTurn, {
    sender: "assistant",
    text: assistantReply.message,
    timestamp: new Date().toISOString(),
    ...(suggestion ? { suggestion: { text: suggestion, original: suggestion } } : {}),
  }];
  await prisma.response.update({
    where: { id: parsed.responseId },
    data: { chatHistory: completedChat as unknown as any[] },
  });

  // `reply` queda sin la etiqueta; la propuesta viaja aparte para mostrarse como bloque editable.
  return { success: true, reply: assistantReply.message, suggestion };
}

const saveRefinementChatSchema = z.object({
  responseId: z.string().min(1),
  chatHistory: chatMessageSchema.default([]),
});

/** Guarda el hilo aun cuando el operador cierre el panel sin aplicar una versión final. */
export async function saveRefinementChatAction(formData: FormData) {
  const rawHistory = formData.get("chatHistory");
  let chatHistory: ChatMessage[] = [];
  try {
    chatHistory = rawHistory ? JSON.parse(rawHistory as string) : [];
  } catch {
    chatHistory = [];
  }

  const parsed = saveRefinementChatSchema.parse({
    responseId: formData.get("responseId"),
    chatHistory,
  });

  const owner = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    select: { opportunity: { select: { clientId: true } } },
  });
  await requireOwnedClientId(owner.opportunity.clientId);

  await prisma.response.update({
    where: { id: parsed.responseId },
    data: { chatHistory: parsed.chatHistory as unknown as any[] },
  });

  return { success: true };
}

const applyChatSuggestionSchema = z.object({
  responseId: z.string().min(1),
  text: z.string().trim().min(3).max(4000),
  chatHistory: chatMessageSchema.default([]),
});

/** "Usar esta respuesta": guarda la versión elegida como ejemplo y aprende de las correcciones del chat. */
export async function applyChatSuggestionAction(formData: FormData) {
  let chatHistory: ChatMessage[] = [];
  try {
    chatHistory = JSON.parse((formData.get("chatHistory") as string | null) || "[]");
  } catch {
    chatHistory = [];
  }
  const parsed = applyChatSuggestionSchema.parse({
    responseId: formData.get("responseId"),
    text: formData.get("text"),
    chatHistory,
  });

  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    select: { opportunityId: true, opportunity: { select: { clientId: true, contextAssessment: true } } },
  });
  const actionClientId = await requireOwnedClientId(response.opportunity.clientId);
  if (optimizedLoading() || manualCMQueue()) await assertCurrentCMResponse(prisma, actionClientId.id, parsed.responseId);
  const maxCharacters = refinementMaxCharacters(response.opportunity.contextAssessment);
  if (maxCharacters && parsed.text.length > maxCharacters) {
    throw new Error(`La propuesta supera los ${maxCharacters} caracteres. Acortala antes de usarla.`);
  }

  await prisma.$transaction([
    prisma.response.updateMany({
      where: { opportunityId: response.opportunityId, id: { not: parsed.responseId } },
      data: { isPrimary: false },
    }),
    prisma.response.update({
      where: { id: parsed.responseId },
      data: { editedText: parsed.text, approvedBy: "CM", acceptedAsCorrectAt: new Date(), isPrimary: true, chatHistory: parsed.chatHistory as unknown as any[] },
    }),
  ]);

  let learnedRules: string[] = [];
  try {
    learnedRules = await learnFromRefinementChat(parsed.responseId, parsed.text);
  } catch (error) {
    logger.error("copilot_use_learning_failed", "No se pudo extraer el aprendizaje de la respuesta elegida", error).catch(() => { });
  }
  if (!optimizedLoading()) revalidatePath("/asistente-cm");
  revalidatePath("/aprendizaje");
  return { success: true, learnedRules };
}

/** Extrae todos los aprendizajes de la conversación completa y los guarda como memoria del cliente. */
async function learnFromRefinementChat(responseId: string, finalText: string): Promise<string[]> {
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: responseId },
    select: {
      opportunityId: true,
      chatHistory: true,
      brand: { select: { name: true } },
      opportunity: { select: { clientId: true, sourceText: true, client: { select: { openrouterApiKey: true, openrouterModel: true } } } },
    },
  });
  const chatHistory = (response.chatHistory as ChatMessage[] | undefined) ?? [];
  if (chatHistory.length === 0 || !response.opportunity.clientId) return [];
  const learnings = await extractLearningsFromChat({
    opportunityText: response.opportunity.sourceText,
    finalResponseText: finalText,
    // Las propuestas y lo que el CM les cambió a mano son parte de lo que hay que aprender.
    chatHistory: expandChatForModel(chatHistory),
    brandName: response.brand.name,
    llmClient: response.opportunity.client,
  });
  // Si el LLM no devolvió nada (o falló), conservamos lo aprendido antes para esta respuesta.
  if (learnings.length === 0) return [];
  return replaceChatLearnings(prisma, {
    clientId: response.opportunity.clientId,
    opportunityId: response.opportunityId,
    responseId,
    learnings,
  });
}

export async function unmarkAcceptedResponseAction(formData: FormData) {
  const responseId = idSchema.parse(formData.get("responseId"));
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: responseId },
    select: { opportunity: { select: { clientId: true } } },
  });
  await requireOwnedClientId(response.opportunity.clientId);
  await prisma.response.update({ where: { id: responseId }, data: { acceptedAsCorrectAt: null } });
  revalidatePath("/aprendizaje");
}

export async function createManualClientMemoryAction(formData: FormData) {
  const clientId = formData.get("clientId") as string;
  const rule = formData.get("rule") as string;
  const category = (formData.get("category") as string) || "general";
  const summary = (formData.get("summary") as string) || "";

  if (!clientId || !rule?.trim()) {
    throw new Error("Cliente y regla son obligatorios.");
  }

  await assertClientAccess(prisma, clientId);

  await addClientMemory(prisma, {
    clientId,
    rule: rule.trim(),
    summary: summary.trim() || undefined,
    category: category.trim(),
    source: "manual",
  });

  revalidatePath("/aprendizaje");
}

export async function deleteClientMemoryAction(memoryId: string) {
  if (!memoryId) throw new Error("ID de memoria requerido.");
  const memory = await prisma.clientMemory.findUnique({
    where: { id: memoryId },
    select: { clientId: true },
  });
  if (!memory) throw new Error("La regla de memoria no existe.");
  await assertClientAccess(prisma, memory.clientId);
  await deleteClientMemory(prisma, memoryId);
  revalidatePath("/aprendizaje");
}

export async function updateClientMemoryAction(formData: FormData) {
  const memoryId = String(formData.get("memoryId") || "");
  const rule = String(formData.get("rule") || "").trim();
  if (!memoryId || rule.length < 5 || rule.length > 800) throw new Error("La regla debe tener entre 5 y 800 caracteres.");
  const memory = await prisma.clientMemory.findUniqueOrThrow({ where: { id: memoryId }, select: { clientId: true } });
  await assertClientAccess(prisma, memory.clientId);
  await prisma.clientMemory.update({ where: { id: memoryId }, data: { rule, summary: rule.slice(0, 80) } });
  revalidatePath("/aprendizaje");
}


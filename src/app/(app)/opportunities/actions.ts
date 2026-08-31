"use server";

import { checkPublishRateLimits, closeSiblingOpportunities, runPublisher } from "@/lib/publish-agent";
import { execFileSync } from "child_process";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { generateLocalDrafts } from "@/lib/draft-generator";
import { COPILOT_MAX_CHARACTERS, generateAICopilotDraft, generateAIDrafts, shortenCopilotText } from "@/lib/ai-draft-generator";
import { selectHumorSignal } from "@/lib/radar-editorial";
import { ensureRequiredBrandMention } from "@/lib/draft-output";
import { loadRelevantKnowledge } from "@/lib/knowledge";
import { loadActivePrompt } from "@/lib/prompts";
import { opportunityIntents, opportunityPriorities, opportunityStatuses } from "@/lib/labels";
import { OpportunityStatus, OpportunityPriority, OpportunityIntent } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getRelayUrl } from "@/lib/settings";
import { loadClientContext, resolveOpportunityClient } from "@/lib/client-context";
import { detectCrossClientTerms, validateClientScopedActors } from "@/lib/guardrails";
import { triageOpportunity } from "@/lib/opportunity-triage";
import { loadObservedProfileContext, overrideObservedProfileSignals, recordObservedProfileEvent } from "@/lib/observed-profiles";
import { loadRelevantCompetitorEvidence } from "@/lib/competitor-evidence";
import { selectVoiceVariant } from "@/lib/persona-router";
import { chatRefinementStep, compileResponseFromChat, type ChatMessage } from "@/lib/refine-draft";
import { addClientMemory, deleteClientMemory, extractLearningFromChat, getClientMemories } from "@/lib/client-memory";
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
  let clientObj = null;
  if (clientSlug) {
    clientObj = await prisma.client.findUnique({ where: { slug: clientSlug } });
  }
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: parsed.channelId }, select: { name: true } });
  assertOperationalOpportunityChannel(channel.name);

  await prisma.opportunity.create({
    data: {
      ...parsed,
      clientId: clientObj?.id || null,
      detectedBrandId: parsed.detectedBrandId || null,
      detectedProductId: parsed.detectedProductId || null,
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

const copilotChoiceSchema = z.object({ opportunityId: z.string().min(1) });
type CopilotGoal = "RESPONDER" | "VENDER" | "CUIDAR";
type CopilotStyle = "NORMAL" | "CON_ONDA" | "CON_CUIDADO";

const COPILOT_SENSITIVE_TEXT = /\b(muert[oe]s?|falleci(?:o|ó|eron)|tragedia|accidente|violencia|crimen|asesin|abuso|denuncia|estafa|reclamo|queja|devoluci[oó]n|garant[ií]a|no funciona|fall[ao]|problema|verg[üu]enza|indign)/i;
const COPILOT_LIGHT_TEXT = /(?:\bjaja(?:ja)?\b|\blol\b|\bmeme\b|\bbanco\b|\bme encanta\b|\bamo\b|😂|🤣|😅|😎|🔥|✨)/i;

/** Safety-first editorial reading: serious topics never receive humour or a trend reference. */
function deriveCopilotApproach(opportunity: { sourceText: string; detectedIntent: OpportunityIntent }): { goal: CopilotGoal; style: CopilotStyle } {
  const text = opportunity.sourceText;
  const sensitive = COPILOT_SENSITIVE_TEXT.test(text) || opportunity.detectedIntent === "WARRANTY_QUESTION";
  if (sensitive) return { goal: "CUIDAR", style: "CON_CUIDADO" };
  if (opportunity.detectedIntent === "PURCHASE_QUESTION" || opportunity.detectedIntent === "PRICE_QUESTION") {
    return { goal: "VENDER", style: "NORMAL" };
  }
  if (COPILOT_LIGHT_TEXT.test(text)) return { goal: "RESPONDER", style: "CON_ONDA" };
  return { goal: "RESPONDER", style: "NORMAL" };
}

function pickCopilotPersona<T extends { name: string }>(
  personas: T[],
  goal: CopilotGoal,
  style: CopilotStyle,
) {
  const byName = (name: string) => personas.find((persona) => persona.name.toLowerCase() === name.toLowerCase());

  if (goal === "VENDER") return byName("Comercial") ?? personas[0];
  if (goal === "CUIDAR" || style === "CON_CUIDADO") return byName("Educativo") ?? personas[0];
  if (style === "CON_ONDA") return byName("Innovación") ?? byName("Innovacion") ?? personas[0];
  return byName("Técnico") ?? byName("Tecnico") ?? byName("Práctico") ?? byName("Practico") ?? personas[0];
}

function copilotGuidance(contextAssessment: unknown, pulse?: { title: string } | null) {
  const context = contextAssessment && typeof contextAssessment === "object"
    ? contextAssessment as Record<string, unknown>
    : {};
  const copilot = context.copilot && typeof context.copilot === "object"
    ? context.copilot as Record<string, unknown>
    : {};
  const objective = copilot.goal === "VENDER"
    ? "Objetivo: orientar hacia un producto o asesoramiento de forma natural, sin presionar ni inventar condiciones comerciales."
    : copilot.goal === "CUIDAR"
      ? "Objetivo: priorizar empatia, claridad y contencion. No uses humor ni referencias de actualidad."
      : "Objetivo: responder de forma util y concreta antes que vender.";
  const voice = copilot.style === "CON_ONDA"
    ? "Estilo: con onda. Podes usar un remate liviano o lenguaje cercano, pero no fuerces memes, sarcasmo ni una referencia que el comentario no pide."
    : copilot.style === "CON_CUIDADO"
      ? "Estilo: con cuidado. Evita remates, ironias y referencias culturales."
      : "Estilo: normal. Claro, cercano y sin buscar un chiste.";
  const pulseNote = copilot.style === "CON_ONDA" && pulse
    ? `Pulso opcional: "${pulse.title}". Solo podes tomarlo como guino si encaja de forma natural con el comentario; si no encaja, ignoralo por completo.`
    : "";
  return [objective, voice, pulseNote].filter(Boolean).join("\n");
}

/**
 * Entrada de acción rápida: el servidor lee la oportunidad y resuelve el
 * objetivo y estilo antes de elegir la voz editorial.
 */
export async function generateCopilotDrafts(formData: FormData) {
  const parsed = copilotChoiceSchema.parse({
    opportunityId: formData.get("opportunityId"),
  });

  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    include: { channel: true, detectedBrand: true, detectedProduct: true },
  });
  assertOperationalOpportunityChannel(opportunity.channel.name);
  const resolution = await resolveOpportunityClient(prisma, opportunity);
  const [brand, personas] = await Promise.all([
    opportunity.detectedBrandId
      ? prisma.brand.findUnique({ where: { id: opportunity.detectedBrandId } })
      : prisma.brand.findFirst({ where: { clientId: resolution.client.id }, orderBy: { name: "asc" } }),
    prisma.persona.findMany({ where: { clientId: resolution.client.id }, orderBy: { name: "asc" } }),
  ]);

  if (!brand || personas.length === 0) {
    throw new Error("Esta oportunidad necesita una marca y al menos una voz editorial para generar respuestas.");
  }

  const approach = deriveCopilotApproach(opportunity);
  const persona = pickCopilotPersona(personas, approach.goal, approach.style);
  const delegatedFormData = new FormData();
  delegatedFormData.set("opportunityId", opportunity.id);
  delegatedFormData.set("brandId", brand.id);
  delegatedFormData.set("personaId", persona.id);
  if (opportunity.detectedProductId && opportunity.detectedProduct?.brandId === brand.id) {
    delegatedFormData.set("productId", opportunity.detectedProductId);
  }

  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      contextAssessment: {
        ...currentContext,
        copilot: {
          goal: approach.goal,
          style: approach.style,
          generatedAt: new Date().toISOString(),
        },
      },
    },
  });
  await generateResponseDrafts(delegatedFormData);

  revalidatePath("/copiloto");
}

const copilotResponseSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  editedText: z.string().min(3).max(COPILOT_MAX_CHARACTERS),
  wasEdited: z.enum(["true", "false"]).default("false"),
});

export async function markCopilotResponse(formData: FormData) {
  const parsed = copilotResponseSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    editedText: formData.get("editedText"),
    wasEdited: formData.get("wasEdited") || "false",
  });
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    select: { opportunityId: true },
  });
  if (response.opportunityId !== parsed.opportunityId) {
    throw new Error("La respuesta no corresponde a esta oportunidad.");
  }

  const delegatedFormData = new FormData();
  delegatedFormData.set("opportunityId", parsed.opportunityId);
  delegatedFormData.set("responseId", parsed.responseId);
  delegatedFormData.set("editedText", parsed.editedText);
  delegatedFormData.set("approvedBy", "CM");
  await approveResponse(delegatedFormData);
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    select: { contextAssessment: true },
  });
  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};
  const currentCopilot = currentContext.copilot && typeof currentContext.copilot === "object"
    ? currentContext.copilot as Record<string, unknown>
    : {};
  await prisma.$transaction([
    prisma.response.update({ where: { id: parsed.responseId }, data: { isPrimary: true } }),
    prisma.opportunity.update({
      where: { id: parsed.opportunityId },
      data: {
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
    }),
  ]);
  revalidatePath("/copiloto");
}

const copilotYouTubePublishSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  editedText: z.string().min(3).max(COPILOT_MAX_CHARACTERS),
  account: z.string().min(1).max(120),
  wasEdited: z.enum(["true", "false"]).default("false"),
});

/** Publicación oficial desde el Copiloto: aprueba y publica en una sola acción. */
export async function publishCopilotYouTubeResponse(formData: FormData) {
  const parsed = copilotYouTubePublishSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    editedText: formData.get("editedText"),
    account: formData.get("account"),
    wasEdited: formData.get("wasEdited") || "false",
  });

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
  if (["PUBLISHED", "CONVERTED", "FOLLOW_UP"].includes(opportunity.status)) throw new Error("Esta oportunidad ya fue publicada.");

  const rateLimit = await checkPublishRateLimits(prisma, parsed.account);
  if (!rateLimit.ok) {
    throw new Error(rateLimit.error === "rate_limited_daily" ? "Límite diario alcanzado para esta cuenta." : "Esperá antes de volver a publicar con esta cuenta.");
  }
  const result = await publishYouTubeComment({
    prisma,
    clientId: opportunity.clientId,
    account: parsed.account,
    sourceUrl: opportunity.sourceUrl,
    text: parsed.editedText,
  });
  if (!result.success) throw new Error(`No se pudo publicar en YouTube: ${result.error}`);

  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};
  const currentCopilot = currentContext.copilot && typeof currentContext.copilot === "object"
    ? currentContext.copilot as Record<string, unknown>
    : {};
  await prisma.$transaction([
    prisma.response.updateMany({ where: { opportunityId: opportunity.id, id: { not: response.id } }, data: { isPrimary: false } }),
    prisma.response.update({ where: { id: response.id }, data: { editedText: parsed.editedText, approvedBy: "CM", isPrimary: true } }),
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
  await closeSiblingOpportunities(prisma, opportunity.id, opportunity.channelId, opportunity.sourceUrl, "youtube");
  revalidatePath("/copiloto");
  revalidatePath(`/opportunities/${opportunity.id}`);
}

const copilotDiscardSchema = z.object({
  opportunityId: z.string().min(1),
  reason: z.enum(["NO_RELEVANTE", "NO_ES_EL_TONO", "FALTA_INFO", "NO_CONVIENE"]).optional(),
});

const copilotFeedbackSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  feedback: z.enum(["SIRVIO", "MAS_DIRECTO", "MENOS_VENTA", "MENOS_HUMOR", "TEMA_SENSIBLE", "NO_APORTO"]),
});

const feedbackRules: Partial<Record<z.infer<typeof copilotFeedbackSchema>["feedback"], { rule: string; category: string }>> = {
  SIRVIO: { rule: "Mantener el tono y nivel de cercanía de las respuestas que el CM marca como útiles.", category: "tone" },
  MAS_DIRECTO: { rule: "Preferir respuestas más directas y breves; evitar rodeos antes de resolver la consulta.", category: "tone" },
  MENOS_VENTA: { rule: "Resolver la duda antes de ofrecer productos; evitar empujar la venta cuando no aporta.", category: "tone" },
  MENOS_HUMOR: { rule: "Usar humor solo si encaja claramente; priorizar una voz natural y sin remates forzados.", category: "tone" },
  TEMA_SENSIBLE: { rule: "En temas sensibles, no usar humor, guiños de actualidad ni presión comercial.", category: "general" },
};

/** Feedback explícito del CM: aprende solo para el cliente de esa respuesta. */
export async function teachCopilotFromResponse(formData: FormData) {
  const parsed = copilotFeedbackSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    feedback: formData.get("feedback"),
  });
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    include: { opportunity: { select: { id: true, clientId: true, contextAssessment: true } } },
  });
  if (response.opportunityId !== parsed.opportunityId || !response.opportunity.clientId) {
    throw new Error("El feedback no corresponde a una respuesta de este cliente.");
  }
  await assertClientAccess(prisma, response.opportunity.clientId);

  const context = response.opportunity.contextAssessment && typeof response.opportunity.contextAssessment === "object"
    ? response.opportunity.contextAssessment as Record<string, unknown>
    : {};
  const copilot = context.copilot && typeof context.copilot === "object"
    ? context.copilot as Record<string, unknown>
    : {};
  const previousFeedback = Array.isArray(copilot.feedback) ? copilot.feedback : [];
  const event = { responseId: parsed.responseId, type: parsed.feedback, at: new Date().toISOString() };
  await prisma.opportunity.update({
    where: { id: parsed.opportunityId },
    data: { contextAssessment: { ...context, copilot: { ...copilot, feedback: [...previousFeedback, event].slice(-12) } } },
  });

  const learning = feedbackRules[parsed.feedback];
  if (learning) {
    await addClientMemory(prisma, {
      clientId: response.opportunity.clientId,
      rule: learning.rule,
      category: learning.category,
      source: `copilot_feedback_${parsed.feedback.toLowerCase()}`,
      opportunityId: parsed.opportunityId,
      responseId: parsed.responseId,
    });
  }
  revalidatePath("/copiloto");
  revalidatePath("/aprendizaje");
}

export async function discardCopilotOpportunity(formData: FormData) {
  const parsed = copilotDiscardSchema.parse({
    opportunityId: formData.get("opportunityId"),
    reason: formData.get("reason") || undefined,
  });
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    select: { contextAssessment: true },
  });
  const currentContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};

  await prisma.opportunity.update({
    where: { id: parsed.opportunityId },
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
  revalidatePath("/copiloto");
}

export async function generateResponseDrafts(formData: FormData) {
  const rl = checkRateLimit("ai_draft_global", 20, 60_000);
  if (!rl.allowed) {
    logger.warn("rate_limit", "generateResponseDrafts bloqueado", { resetInMs: rl.resetInMs }).catch(() => {});
    throw new Error(`Demasiadas solicitudes a la IA. Esperá ${Math.ceil(rl.resetInMs / 1000)}s.`);
  }

  const opportunityId = idSchema.parse(formData.get("opportunityId"));
  const personaId = idSchema.parse(formData.get("personaId"));
  const brandId = idSchema.parse(formData.get("brandId"));
  // Los formularios de la pantalla de oportunidad siempre envían este campo,
  // incluso si se eligió "Sin producto específico". Las acciones internas
  // (por ejemplo Copiloto) pueden omitirlo para conservar el producto detectado.
  const hasExplicitProductSelection = formData.has("productId");
  const productId = (formData.get("productId") || "") as string;

  const [opportunity, persona, brand, selectedProduct] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      include: {
        channel: true,
        detectedBrand: { include: { client: true } },
        detectedProduct: true,
        monitoredSource: { include: { client: true } }
      }
    }),
    prisma.persona.findUniqueOrThrow({ where: { id: personaId } }),
    prisma.brand.findUniqueOrThrow({ where: { id: brandId } }),
    productId ? prisma.product.findUnique({ where: { id: productId }, include: { brand: true } }) : Promise.resolve(null)
  ]);

  if (opportunity.status === "PUBLISHED" || opportunity.status === "CONVERTED" || opportunity.status === "FOLLOW_UP") {
    throw new Error("Esta oportunidad ya fue respondida/publicada y no se pueden generar más borradores.");
  }
  assertOperationalOpportunityChannel(opportunity.channel.name);

  const resolution = await resolveOpportunityClient(prisma, opportunity);
  const clientContext = await loadClientContext(prisma, resolution.client.id, opportunity);
  if (brand.clientId && brand.clientId !== resolution.client.id) {
    throw new Error("La marca seleccionada no pertenece al cliente de esta oportunidad.");
  }
  if (persona.clientId && persona.clientId !== resolution.client.id) {
    throw new Error("La persona seleccionada no pertenece al cliente de esta oportunidad.");
  }
  if (selectedProduct && selectedProduct.brandId !== brandId) {
    throw new Error("El producto seleccionado no pertenece a la marca elegida.");
  }
  const actorValidation = validateClientScopedActors({ client: resolution.client, brand, persona });
  if (!actorValidation.ok) throw new Error(actorValidation.riskNotes.join("; "));

  const opportunityForDraft = {
    ...opportunity,
    detectedBrandId: brandId,
    detectedBrand: brand,
    detectedProductId: hasExplicitProductSelection
      ? (selectedProduct?.id ?? null)
      : (selectedProduct?.id ?? opportunity.detectedProductId),
    detectedProduct: hasExplicitProductSelection
      ? selectedProduct
      : (selectedProduct ?? opportunity.detectedProduct),
  };

  const [{ knowledge, objections }, activeSystemPrompt, clientMemories] = await Promise.all([
    loadRelevantKnowledge(prisma, {
      sourceText: opportunity.sourceText,
      clientId: resolution.client.id,
      brandId,
      productId: opportunityForDraft.detectedProductId
    }),
    loadActivePrompt(prisma),
    getClientMemories(prisma, resolution.client.id)
  ]);
  const [observedProfile, competitorEvidence] = await Promise.all([
    loadObservedProfileContext(prisma, opportunity.id),
    loadRelevantCompetitorEvidence(prisma, resolution.client.id, opportunity.sourceText),
  ]);
  const copilotContext = opportunity.contextAssessment && typeof opportunity.contextAssessment === "object"
    ? opportunity.contextAssessment as Record<string, unknown>
    : {};
  const copilot = copilotContext.copilot && typeof copilotContext.copilot === "object"
    ? copilotContext.copilot as Record<string, unknown>
    : {};
  const pulse = copilot.style === "CON_ONDA"
    ? selectHumorSignal(await prisma.trend.findMany({
        where: {
          clientId: resolution.client.id,
          platform: { in: ["GOOGLE_TRENDS", "TWITTER"] },
          createdAt: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true, title: true, description: true, sourceUrl: true, platform: true, createdAt: true, metadata: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }))
    : null;
  if (pulse) {
    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
        contextAssessment: {
          ...copilotContext,
          copilot: { ...copilot, pulse: { title: pulse.title, platform: pulse.platform, selectedAt: new Date().toISOString() } },
        },
      },
    });
  }

  const ctx = {
    opportunity: opportunityForDraft,
    persona,
    brand,
    client: resolution.client,
    // Una elección manual es autoritativa: no volvemos a rankear el catálogo
    // con el texto original, porque podría imponerse un producto mencionado
    // previamente (por ejemplo KeyLab) sobre el que eligió el operador
    // (por ejemplo MiniFuse).
    catalogProducts: hasExplicitProductSelection
      ? (selectedProduct ? [selectedProduct] : [])
      : clientContext.catalogProducts.filter((p) => p.brandId === brandId),
    catalogRules: clientContext.catalogRules,
    services: clientContext.services.filter((service) => service.brandId === brandId),
    knowledge,
    objections,
    activeSystemPrompt,
    observedProfile,
    competitorEvidence,
    clientMemories: clientMemories.map((m) => ({ rule: m.rule })),
    editorialGuidance: copilotGuidance(opportunity.contextAssessment, pulse ? { title: pulse.title } : null),
  };
  const voiceVariant = selectVoiceVariant(persona.name, observedProfile);
  const isCopilotRequest = Boolean(copilot.goal && copilot.style);
  const localDrafts = generateLocalDrafts(ctx);
  const localShort = localDrafts.find((draft) => draft.variantType === "SHORT") ?? localDrafts[0];
  if (!localShort) throw new Error("No se pudo preparar una propuesta local segura.");
  // El Copiloto es una herramienta de acción: presenta una propuesta principal
  // editable, no obliga al CM a comparar variantes antes de responder.
  const copilotDraft = isCopilotRequest ? await generateAICopilotDraft(ctx) : null;
  const drafts = isCopilotRequest
    ? [{ ...(copilotDraft ?? localShort), draftText: shortenCopilotText((copilotDraft ?? localShort).draftText) }]
    : ((await generateAIDrafts(ctx)) ?? localDrafts);
  const draftsWithRisks = await Promise.all(drafts.map(async (draft) => {
    const crossClientHits = await detectCrossClientTerms(prisma, resolution.client.id, draft.draftText);
    return {
      ...draft,
      riskNotes: [
        draft.riskNotes,
        resolution.confidence !== "high" ? `Cliente resuelto con confianza ${resolution.confidence}: ${resolution.reason}.` : "",
        crossClientHits.length > 0 ? `Posible mezcla de otro cliente: ${crossClientHits.join("; ")}.` : "",
      ].filter(Boolean).join(" "),
    };
  }));

  await prisma.$transaction([
    prisma.response.deleteMany({
      where: {
        opportunityId,
        personaId,
        brandId,
        approvedBy: ""
      }
    }),
    prisma.response.createMany({
      data: draftsWithRisks.map((draft) => ({
        opportunityId,
        personaId,
        brandId,
        variantType: draft.variantType,
        voiceVariant: voiceVariant.voiceVariant,
        voiceVariantReason: voiceVariant.voiceVariantReason,
        draftText: ensureRequiredBrandMention(draft.draftText, resolution.client.slug),
        riskNotes: draft.riskNotes
      }))
    }),
    prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        detectedBrandId: brandId,
        detectedProductId: opportunityForDraft.detectedProductId,
        status: OpportunityStatus.DRAFTED
      }
    })
  ]);

  revalidatePath("/");
  revalidatePath(`/opportunities/${opportunityId}`);
}

const manualResponseSchema = z.object({
  opportunityId: z.string().min(1), brandId: z.string().min(1), productId: z.string().optional(),
  personaId: z.string().min(1), editedText: z.string().trim().min(3).max(4000),
});

export async function createManualResponse(formData: FormData) {
  const parsed = manualResponseSchema.parse({ opportunityId: formData.get("opportunityId"), brandId: formData.get("brandId"), productId: formData.get("productId") || undefined, personaId: formData.get("personaId"), editedText: formData.get("editedText") });
  const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { id: parsed.opportunityId }, include: { channel: true, detectedBrand: { include: { client: true } }, detectedProduct: true, monitoredSource: { include: { client: true } } } });
  assertOperationalOpportunityChannel(opportunity.channel.name);
  if (["PUBLISHED", "CONVERTED", "FOLLOW_UP"].includes(opportunity.status)) throw new Error("Esta oportunidad ya fue respondida.");
  const resolution = await resolveOpportunityClient(prisma, opportunity);
  const [brand, persona, product] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: parsed.brandId } }),
    prisma.persona.findUniqueOrThrow({ where: { id: parsed.personaId } }),
    parsed.productId ? prisma.product.findUnique({ where: { id: parsed.productId } }) : Promise.resolve(null),
  ]);
  if ((brand.clientId && brand.clientId !== resolution.client.id) || (persona.clientId && persona.clientId !== resolution.client.id) || (product && product.brandId !== brand.id)) throw new Error("Marca, producto y voz no pertenecen al cliente seleccionado.");
  await prisma.response.create({ data: { opportunityId: opportunity.id, brandId: brand.id, personaId: persona.id, variantType: "CONVERSATIONAL", draftText: parsed.editedText, editedText: parsed.editedText, approvedBy: "" } });
  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { detectedBrandId: brand.id, detectedProductId: product?.id ?? null, status: OpportunityStatus.DRAFTED } });
  revalidatePath(`/opportunities/${opportunity.id}`);
}

const approveResponseSchema = z.object({
  responseId: z.string().min(1),
  opportunityId: z.string().min(1),
  editedText: z.string().min(3).max(4000),
  approvedBy: z.string().min(1).max(80).default("Operador"),
  personaId: z.string().min(1).optional(),
});

export async function approveResponse(formData: FormData) {
  const parsed = approveResponseSchema.parse({
    responseId: formData.get("responseId"),
    opportunityId: formData.get("opportunityId"),
    editedText: formData.get("editedText"),
    approvedBy: formData.get("approvedBy") || "Operador",
    personaId: formData.get("personaId") || undefined,
  });
  const [opportunity, response] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: parsed.opportunityId },
      select: { status: true, clientId: true, sourceText: true, channel: { select: { name: true } } },
    }),
    prisma.response.findUniqueOrThrow({
      where: { id: parsed.responseId },
      include: { brand: true, persona: true },
    }),
  ]);
  assertOperationalOpportunityChannel(opportunity.channel.name);

  if (opportunity.status === "PUBLISHED" || opportunity.status === "CONVERTED" || opportunity.status === "FOLLOW_UP") {
    throw new Error("La oportunidad ya está publicada/respondida y no se puede modificar la aprobación.");
  }

  const data: { editedText: string; approvedBy: string; personaId?: string } = {
    editedText: parsed.editedText,
    approvedBy: parsed.approvedBy,
  };

  if (parsed.personaId && parsed.personaId !== response.personaId) {
    const persona = await prisma.persona.findUniqueOrThrow({
      where: { id: parsed.personaId },
      select: { clientId: true },
    });
    if (persona.clientId && opportunity.clientId && persona.clientId !== opportunity.clientId) {
      throw new Error("La persona seleccionada no pertenece al cliente de esta oportunidad.");
    }
    data.personaId = parsed.personaId;
  }

  await prisma.$transaction([
    prisma.response.update({
      where: { id: parsed.responseId },
      data,
    }),
    prisma.opportunity.update({
      where: { id: parsed.opportunityId },
      data: { status: OpportunityStatus.APPROVED },
    }),
  ]);

  // Extraer y guardar aprendizaje si hubo chat de refinimiento
  const chatHistory = (response.chatHistory as ChatMessage[] | undefined) ?? [];
  if (chatHistory.length > 0 && opportunity.clientId) {
    const learning = await extractLearningFromChat({
      opportunityText: opportunity.sourceText,
      finalResponseText: parsed.editedText,
      chatHistory: chatHistory.map((m) => ({ sender: m.sender, text: m.text })),
      brandName: response.brand.name,
    });
    if (learning) {
      await addClientMemory(prisma, {
        clientId: opportunity.clientId,
        rule: learning.rule,
        summary: learning.summary,
        category: learning.category,
        source: "chat_refinement",
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
      });
    }
  }

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

const approveAndPublishResponseSchema = z.object({
  responseId: z.string().min(1),
  opportunityId: z.string().min(1),
  editedText: z.string().min(3).max(4000),
  approvedBy: z.string().min(1).max(80).default("Operador"),
  personaId: z.string().min(1).optional(),
  account: z.string().min(1),
  client: z.string().optional(),
});

export async function approveAndPublishResponse(formData: FormData) {
  const parsed = approveAndPublishResponseSchema.parse({
    responseId: formData.get("responseId"),
    opportunityId: formData.get("opportunityId"),
    editedText: formData.get("editedText"),
    approvedBy: formData.get("approvedBy") || "Operador",
    personaId: formData.get("personaId") || undefined,
    account: formData.get("account") || "",
    client: formData.get("client") || "",
  });

  const relayUrl = await getRelayUrl();
  if (relayUrl && process.env.AGENT_RELAY_TOKEN) {
    throw new Error("El flujo 'Publicar comentario' no está disponible en modo relay. Usá el flujo manual.");
  }

  const [opportunity, response] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: parsed.opportunityId },
      include: { channel: true },
    }),
    prisma.response.findUniqueOrThrow({
      where: { id: parsed.responseId },
      include: { persona: true, brand: true },
    }),
  ]);

  if (opportunity.status === "PUBLISHED" || opportunity.status === "CONVERTED" || opportunity.status === "FOLLOW_UP") {
    throw new Error("La oportunidad ya está publicada/respondida.");
  }

  const channelLower = opportunity.channel.name.toLowerCase();
  assertOperationalOpportunityChannel(opportunity.channel.name);

  const data: { editedText: string; approvedBy: string; personaId?: string } = {
    editedText: parsed.editedText,
    approvedBy: parsed.approvedBy,
  };

  if (parsed.personaId && parsed.personaId !== response.personaId) {
    const persona = await prisma.persona.findUniqueOrThrow({
      where: { id: parsed.personaId },
      select: { clientId: true },
    });
    if (persona.clientId && opportunity.clientId && persona.clientId !== opportunity.clientId) {
      throw new Error("La persona seleccionada no pertenece al cliente de esta oportunidad.");
    }
    data.personaId = parsed.personaId;
  }

  const rateLimit = await checkPublishRateLimits(prisma, parsed.account);
  if (!rateLimit.ok) {
    const msg = rateLimit.error === "rate_limited_daily"
      ? "Límite diario alcanzado para esta cuenta."
      : `Esperá ${rateLimit.retryAfterSec ? Math.ceil(rateLimit.retryAfterSec / 60) : "unos minutos"} antes de publicar.`;
    throw new Error(msg);
  }

  const publishResult = runPublisher({
    channel: channelLower,
    sourceUrl: opportunity.sourceUrl,
    text: parsed.editedText,
    account: parsed.account,
  });

  if (!publishResult.success) {
    throw new Error(`No se pudo publicar: ${publishResult.error}`);
  }

  await prisma.$transaction([
    prisma.response.update({
      where: { id: parsed.responseId },
      data,
    }),
    prisma.publishingLog.upsert({
      where: { responseId: parsed.responseId },
      update: {
        account: parsed.account,
        publishedUrl: publishResult.url,
        result: "published_via_agent",
        followUpNeeded: false,
      },
      create: {
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
        account: parsed.account,
        publishedUrl: publishResult.url,
        result: "published_via_agent",
        followUpNeeded: false,
      },
    }),
    prisma.opportunity.update({
      where: { id: parsed.opportunityId },
      data: { status: OpportunityStatus.PUBLISHED },
    }),
  ]);

  await closeSiblingOpportunities(
    prisma,
    parsed.opportunityId,
    opportunity.channelId,
    opportunity.sourceUrl,
    channelLower
  );

  // Extraer y guardar aprendizaje si hubo chat de refinimiento
  const chatHistory = (response.chatHistory as ChatMessage[] | undefined) ?? [];
  if (chatHistory.length > 0 && opportunity.clientId) {
    const learning = await extractLearningFromChat({
      opportunityText: opportunity.sourceText,
      finalResponseText: parsed.editedText,
      chatHistory: chatHistory.map((m) => ({ sender: m.sender, text: m.text })),
      brandName: response.brand.name,
    });
    if (learning) {
      await addClientMemory(prisma, {
        clientId: opportunity.clientId,
        rule: learning.rule,
        summary: learning.summary,
        category: learning.category,
        source: "chat_refinement",
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
      });
    }
  }

  const client = parsed.client;
  const clientQuery = client ? `&client=${encodeURIComponent(client)}` : "";
  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
  redirect(`/opportunities/${parsed.opportunityId}?agentOk=1${clientQuery}`);
}

const publishSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  publishedUrl: z.string().url().optional().or(z.literal("")),
  result: z.enum(["manual_meta", "manual", "published"]).default("manual"),
  account: z.string().max(120).optional(),
  followUpNeeded: z.string().optional()
});

export async function markAsPublished(formData: FormData) {
  const parsed = publishSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    publishedUrl: formData.get("publishedUrl") || "",
    result: formData.get("result") || "manual",
    account: formData.get("account") || "",
    followUpNeeded: formData.get("followUpNeeded") || ""
  });

  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    include: { channel: true }
  });
  assertOperationalOpportunityChannel(opportunity.channel.name);

  if (opportunity.status === "PUBLISHED" || opportunity.status === "CONVERTED" || opportunity.status === "FOLLOW_UP") {
    throw new Error("Esta oportunidad ya fue respondida/publicada.");
  }

  // Cerrar oportunidades HERMANAS del mismo post (mismo video/hilo/publicación)
  const postKey = extractPostKey(opportunity.channel.name, opportunity.sourceUrl);
  const siblingUpdate = postKey
    ? [
        prisma.opportunity.updateMany({
          where: {
            id: { not: parsed.opportunityId },
            channelId: opportunity.channelId,
            status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] },
            sourceUrl: { contains: postKey },
          },
          data: {
            status: OpportunityStatus.DISCARDED,
            notes: `Auto-descartada: ya se publicó un comentario en este post (${postKey}).`,
          },
        }),
      ]
    : [];

  await prisma.$transaction([
    prisma.publishingLog.upsert({
      where: { responseId: parsed.responseId },
      update: {
        publishedUrl: parsed.publishedUrl,
        result: parsed.result,
        publishMethod: parsed.result === "manual_meta" ? "manual_meta" : "manual",
        account: parsed.account || undefined,
        followUpNeeded: parsed.followUpNeeded === "on"
      },
      create: {
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
        publishedUrl: parsed.publishedUrl,
        result: parsed.result,
        publishMethod: parsed.result === "manual_meta" ? "manual_meta" : "manual",
        account: parsed.account,
        followUpNeeded: parsed.followUpNeeded === "on"
      }
    }),
    prisma.opportunity.update({
      where: { id: parsed.opportunityId },
      data: { status: parsed.followUpNeeded === "on" ? OpportunityStatus.FOLLOW_UP : OpportunityStatus.PUBLISHED }
    }),
    ...siblingUpdate
  ]);

  // Extraer y guardar aprendizaje si hubo chat de refinimiento
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    include: { brand: true }
  });
  const chatHistory = (response.chatHistory as ChatMessage[] | undefined) ?? [];
  if (chatHistory.length > 0 && opportunity.clientId) {
    const finalText = response.editedText || response.draftText;
    const learning = await extractLearningFromChat({
      opportunityText: opportunity.sourceText,
      finalResponseText: finalText,
      chatHistory: chatHistory.map((m) => ({ sender: m.sender, text: m.text })),
      brandName: response.brand.name,
    });
    if (learning) {
      await addClientMemory(prisma, {
        clientId: opportunity.clientId,
        rule: learning.rule,
        summary: learning.summary,
        category: learning.category,
        source: "chat_refinement",
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
      });
    }
  }

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

const simulateDemoPublicationSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
});

/** Solo habilitado para la cuenta ficticia local, sin conexión a redes externas. */
export async function simulateDemoPublication(formData: FormData) {
  const parsed = simulateDemoPublicationSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
  });

  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    include: { client: true },
  });
  if (opportunity.client?.slug !== "aurora-demo") {
    throw new Error("La simulación de publicación solo está disponible en la cuenta demo local.");
  }

  const response = await prisma.response.findFirst({
    where: { id: parsed.responseId, opportunityId: parsed.opportunityId },
  });
  if (!response?.approvedBy) {
    throw new Error("Aprobá el borrador antes de simular la publicación.");
  }

  await prisma.$transaction([
    prisma.publishingLog.upsert({
      where: { responseId: parsed.responseId },
      update: {
        publishedUrl: `https://demo.local/publicado/${parsed.responseId}`,
        publishedBy: "Simulación local",
        result: "published",
      },
      create: {
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
        publishedUrl: `https://demo.local/publicado/${parsed.responseId}`,
        publishedBy: "Simulación local",
        account: "Cuenta demo",
        result: "published",
      },
    }),
    prisma.opportunity.update({
      where: { id: parsed.opportunityId },
      data: { status: OpportunityStatus.PUBLISHED },
    }),
  ]);

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
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

  await prisma.opportunity.update({
    where: { id: parsed.opportunityId },
    data: { status: parsed.status }
  });

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

const publishViaAgentSchema = z.object({
  opportunityId: z.string().min(1),
  responseId: z.string().min(1),
  account: z.string().optional(),
  editedText: z.string().min(3).max(4000).optional(),
});

export async function publishViaAgent(formData: FormData) {
  const parsed = publishViaAgentSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    account: formData.get("account") || undefined,
    editedText: formData.get("editedText") || undefined,
  });

  const [opportunity, response] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: parsed.opportunityId },
      select: { status: true, clientId: true, channelId: true, sourceUrl: true, channel: { select: { name: true } } }
    }),
    prisma.response.findFirst({
      where: { id: parsed.responseId, opportunityId: parsed.opportunityId },
      select: { id: true, approvedBy: true, editedText: true, draftText: true },
    }),
  ]);
  assertOperationalOpportunityChannel(opportunity.channel.name);

  if (!response) {
    throw new Error("La respuesta no pertenece a esta oportunidad.");
  }

  if (opportunity.status === "PUBLISHED" || opportunity.status === "CONVERTED" || opportunity.status === "FOLLOW_UP") {
    throw new Error("La oportunidad ya está publicada/respondida y no se puede publicar de nuevo.");
  }

  if (!response.approvedBy) {
    throw new Error("Aprobá el borrador antes de publicarlo.");
  }

  const channel = opportunity.channel.name.toLowerCase();
  if (channel === "facebook" || channel === "instagram") {
    throw new Error("Meta requiere publicación manual asistida: copiá el texto, abrí el post y confirmá después de publicarlo.");
  }
  if (channel !== "youtube") {
    throw new Error("La publicación automática oficial está habilitada únicamente para YouTube.");
  }
  if (!opportunity.clientId) {
    throw new Error("La oportunidad debe pertenecer a un cliente antes de publicar.");
  }
  if (!parsed.account) {
    throw new Error("Elegí la cuenta de YouTube autorizada para publicar.");
  }

  // La publicación directa puede partir de un texto editado en la tarjeta. Se persiste
  // antes de enviar la tarea al relay para que el agente publique exactamente ese texto.
  if (parsed.editedText) {
    await prisma.response.update({
      where: { id: parsed.responseId },
      data: { editedText: parsed.editedText },
    });
  }

  const rateLimit = await checkPublishRateLimits(prisma, parsed.account);
  if (!rateLimit.ok) {
    throw new Error(rateLimit.error === "rate_limited_daily" ? "Límite diario alcanzado para esta cuenta." : "Esperá antes de volver a publicar con esta cuenta.");
  }

  const publishedText = parsed.editedText || response.editedText || response.draftText;
  const officialResult = await publishYouTubeComment({
    prisma,
    clientId: opportunity.clientId,
    account: parsed.account,
    sourceUrl: opportunity.sourceUrl,
    text: publishedText,
  });
  if (!officialResult.success) {
    throw new Error(`No se pudo publicar en YouTube: ${officialResult.error}`);
  }

  await prisma.$transaction([
    prisma.publishingLog.upsert({
      where: { responseId: parsed.responseId },
      update: { account: parsed.account, publishedUrl: officialResult.url, remoteId: officialResult.remoteId, publishMethod: officialResult.method, result: officialResult.method, followUpNeeded: false },
      create: { opportunityId: parsed.opportunityId, responseId: parsed.responseId, account: parsed.account, publishedUrl: officialResult.url, remoteId: officialResult.remoteId, publishMethod: officialResult.method, result: officialResult.method, followUpNeeded: false },
    }),
    prisma.opportunity.update({ where: { id: parsed.opportunityId }, data: { status: OpportunityStatus.PUBLISHED } }),
  ]);
  await closeSiblingOpportunities(prisma, parsed.opportunityId, opportunity.channelId, opportunity.sourceUrl, channel);
  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
  const clientParam = formData.get("client") as string | null;
  redirect(`/opportunities/${parsed.opportunityId}?agentOk=1${clientParam ? `&client=${encodeURIComponent(clientParam)}` : ""}`);
}

export async function updateClientAutoSettings(clientId: string, autoApprove: boolean, autoPublish: boolean) {
  await prisma.client.update({
    where: { id: clientId },
    data: { autoApprove, autoPublish },
  });
  revalidatePath("/");
}

const deleteResponseSchema = z.object({
  responseId: z.string().min(1),
  opportunityId: z.string().min(1),
});

export async function deleteResponse(formData: FormData) {
  const parsed = deleteResponseSchema.parse({
    responseId: formData.get("responseId"),
    opportunityId: formData.get("opportunityId"),
  });

  const response = await prisma.response.findUnique({
    where: { id: parsed.responseId },
    select: { approvedBy: true },
  });

  if (!response) {
    throw new Error("La respuesta que intentas eliminar no existe.");
  }

  const wasApproved = !!response.approvedBy;

  await prisma.response.delete({
    where: { id: parsed.responseId },
  });

  if (wasApproved) {
    const remainingResponses = await prisma.response.findMany({
      where: { opportunityId: parsed.opportunityId },
      select: { approvedBy: true },
    });

    const hasApproved = remainingResponses.some((r) => r.approvedBy);

    if (!hasApproved) {
      const newStatus = remainingResponses.length > 0
        ? OpportunityStatus.DRAFTED
        : OpportunityStatus.NEEDS_REVIEW;

      await prisma.opportunity.update({
        where: { id: parsed.opportunityId },
        data: { status: newStatus },
      });
    }
  }

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

export async function assignMissingOpportunityClients(formData: FormData) {
  const clientSlug = (formData.get("client") || "") as string;
  const limit = Math.min(200, Math.max(1, Number(formData.get("limit") || 100)));
  const client = clientSlug
    ? await prisma.client.findUnique({ where: { slug: clientSlug } })
    : null;

  const opportunities = await prisma.opportunity.findMany({
    where: {
      clientId: null,
      status: { in: [OpportunityStatus.NEW, OpportunityStatus.NEEDS_REVIEW] },
    },
    include: {
      detectedBrand: { include: { client: true } },
      monitoredSource: { include: { client: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let updated = 0;
  for (const opportunity of opportunities) {
    const resolution = client
      ? { client, confidence: "medium" as const, reason: "manual_active_client_scope" }
      : await resolveOpportunityClient(prisma, opportunity);

    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
        clientId: resolution.client.id,
        notes: [
          opportunity.notes,
          `Cliente asignado por limpieza masiva: ${resolution.client.slug} (${resolution.confidence}, ${resolution.reason}).`,
        ].filter(Boolean).join(" "),
      },
    });
    updated += 1;
  }

  revalidatePath("/");
  revalidatePath("/oportunidades");
}

export async function discardNoisyNewOpportunities(formData: FormData) {
  const clientSlug = (formData.get("client") || "") as string;
  const limit = Math.min(300, Math.max(1, Number(formData.get("limit") || 150)));
  const client = clientSlug
    ? await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } })
    : null;

  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: { in: [OpportunityStatus.NEW, OpportunityStatus.NEEDS_REVIEW] },
      responses: { none: {} },
      ...(client ? { clientId: client.id } : {}),
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: limit,
  });

  const updates = opportunities
    .map((opportunity) => ({ opportunity, decision: triageOpportunity(opportunity) }))
    .filter((row) => row.decision.action === "discard")
    .map((row) => prisma.opportunity.update({
      where: { id: row.opportunity.id },
      data: {
        status: OpportunityStatus.DISCARDED,
        notes: [
          row.opportunity.notes,
          `Auto-descartada por limpieza de bandeja: ${row.decision.reason} (score ${row.decision.score}).`,
        ].filter(Boolean).join(" "),
      },
    }));

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  revalidatePath("/");
  revalidatePath("/oportunidades");
}

export async function generateDailyDraftBatch(formData: FormData) {
  const clientSlug = (formData.get("client") || "") as string;
  const limit = Math.min(10, Math.max(1, Number(formData.get("limit") || 5)));
  const args = ["tsx", "scripts/draft-worker.mts", "--limit", String(limit)];
  if (clientSlug) args.push("--client", clientSlug);

  try {
    execFileSync("npx", args, { cwd: process.cwd(), encoding: "utf-8", stdio: "pipe" });
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(`No se pudo generar el lote de borradores. ${stdout || stderr}`);
  }

  revalidatePath("/");
  revalidatePath("/oportunidades");
}

const updateObservedSignalsSchema = z.object({
  opportunityId: z.string().min(1),
  primaryTopic: z.string().min(1),
  secondaryTopics: z.string().optional(),
  topicConfidence: z.enum(["high", "medium", "low"]),
  tone: z.enum(["casual", "technical", "formal", "aspirational", "direct", "mixed"]),
  toneConfidence: z.enum(["high", "medium", "low"]),
});

export async function updateObservedSignals(formData: FormData) {
  const parsed = updateObservedSignalsSchema.parse({
    opportunityId: formData.get("opportunityId"),
    primaryTopic: formData.get("primaryTopic"),
    secondaryTopics: formData.get("secondaryTopics") || "",
    topicConfidence: formData.get("topicConfidence"),
    tone: formData.get("tone"),
    toneConfidence: formData.get("toneConfidence"),
  });

  await overrideObservedProfileSignals(prisma, {
    opportunityId: parsed.opportunityId,
    primaryTopic: parsed.primaryTopic,
    secondaryTopics: (parsed.secondaryTopics ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    topicConfidence: parsed.topicConfidence,
    tone: parsed.tone,
    toneConfidence: parsed.toneConfidence,
  });

  revalidatePath(`/opportunities/${parsed.opportunityId}`);
  revalidatePath("/oportunidades");
}

function extractPostKey(channel: string, url: string): string | null {
  try {
    const ch = (channel || "").toLowerCase();
    if (ch === "youtube") {
      const v = new URL(url).searchParams.get("v");
      return v ? `v=${v}` : null;
    }
    if (ch === "reddit") {
      const m = url.match(/\/comments\/([a-z0-9]+)/i);
      return m ? `/comments/${m[1]}` : null;
    }
    if (ch === "instagram") {
      const m = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      return m ? `/${m[1]}/${m[2]}` : null;
    }
    if (ch === "facebook") {
      const m = url.match(/\/posts\/(\d+)/) || url.match(/\/permalink\/(\d+)/) || url.match(/[?&]story_fbid=(\d+)/);
      return m ? m[1] : null;
    }
    if (ch === "x" || ch === "twitter") {
      const m = url.match(/\/status\/(\d+)/);
      return m ? `/status/${m[1]}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

const chatMessageSchema = z.array(
  z.object({
    sender: z.enum(["user", "assistant"]),
    text: z.string(),
    timestamp: z.string().optional(),
  })
);

const sendRefinementMessageSchema = z.object({
  responseId: z.string().min(1),
  userMessage: z.string().min(1).max(2000),
  chatHistory: chatMessageSchema.default([]),
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
  });

  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    include: {
      opportunity: { include: { channel: true } },
      brand: true,
      persona: true,
    },
  });

  const resolution = await resolveOpportunityClient(prisma, response.opportunity);
  const clientMemories = await getClientMemories(prisma, resolution.client.id);

  const assistantReply = await chatRefinementStep({
    opportunityText: response.opportunity.sourceText,
    currentResponseText: response.editedText || response.draftText,
    chatHistory: parsed.chatHistory,
    userMessage: parsed.userMessage,
    brandName: response.brand.name,
    personaName: response.persona.name,
    clientName: resolution.client.name,
    clientMemories: clientMemories.map((m) => ({ rule: m.rule })),
  });

  return { success: true, reply: assistantReply };
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

  await prisma.response.update({
    where: { id: parsed.responseId },
    data: { chatHistory: parsed.chatHistory as unknown as any[] },
  });

  return { success: true };
}

const applyRefinedResponseSchema = z.object({
  responseId: z.string().min(1),
  chatHistory: chatMessageSchema.default([]),
});

export async function applyRefinedResponseAction(formData: FormData) {
  const rawHistory = formData.get("chatHistory");
  let chatHistory: ChatMessage[] = [];
  try {
    chatHistory = rawHistory ? JSON.parse(rawHistory as string) : [];
  } catch {
    chatHistory = [];
  }

  const parsed = applyRefinedResponseSchema.parse({
    responseId: formData.get("responseId"),
    chatHistory,
  });

  const response = await prisma.response.findUniqueOrThrow({
    where: { id: parsed.responseId },
    include: {
      opportunity: { include: { channel: true } },
      brand: true,
      persona: true,
    },
  });

  const resolution = await resolveOpportunityClient(prisma, response.opportunity);
  const clientMemories = await getClientMemories(prisma, resolution.client.id);

  const compiledText = await compileResponseFromChat({
    opportunityText: response.opportunity.sourceText,
    chatHistory: parsed.chatHistory,
    currentResponseText: response.editedText || response.draftText,
    brandName: response.brand.name,
    personaName: response.persona.name,
    clientMemories: clientMemories.map((m) => ({ rule: m.rule })),
  });

  await prisma.$transaction([
    prisma.response.updateMany({
      where: { opportunityId: response.opportunityId, id: { not: parsed.responseId } },
      data: { isPrimary: false },
    }),
    prisma.response.update({
      where: { id: parsed.responseId },
      data: {
        editedText: compiledText,
        isPrimary: true,
        chatHistory: parsed.chatHistory as unknown as any[],
      },
    }),
  ]);

  revalidatePath(`/opportunities/${response.opportunityId}`);
  return { success: true, compiledText };
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


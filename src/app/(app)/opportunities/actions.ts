"use server";

import { checkPublishRateLimits, closeSiblingOpportunities, runPublisher } from "@/lib/publish-agent";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateLocalDrafts } from "@/lib/draft-generator";
import { generateAIDrafts } from "@/lib/ai-draft-generator";
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

export async function generateResponseDrafts(formData: FormData) {
  const rl = checkRateLimit("ai_draft_global", 20, 60_000);
  if (!rl.allowed) {
    logger.warn("rate_limit", "generateResponseDrafts bloqueado", { resetInMs: rl.resetInMs }).catch(() => {});
    throw new Error(`Demasiadas solicitudes a la IA. Esperá ${Math.ceil(rl.resetInMs / 1000)}s.`);
  }

  const opportunityId = idSchema.parse(formData.get("opportunityId"));
  const personaId = idSchema.parse(formData.get("personaId"));
  const brandId = idSchema.parse(formData.get("brandId"));
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
    detectedProductId: selectedProduct?.id ?? opportunity.detectedProductId,
    detectedProduct: selectedProduct ?? opportunity.detectedProduct,
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

  const ctx = {
    opportunity: opportunityForDraft,
    persona,
    brand,
    client: resolution.client,
    catalogProducts: clientContext.catalogProducts.filter((p) => p.brandId === brandId),
    catalogRules: clientContext.catalogRules,
    knowledge,
    objections,
    activeSystemPrompt,
    observedProfile,
    competitorEvidence,
    clientMemories: clientMemories.map((m) => ({ rule: m.rule })),
  };
  const voiceVariant = selectVoiceVariant(persona.name, observedProfile);
  const drafts = (await generateAIDrafts(ctx)) ?? generateLocalDrafts(ctx);
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
      select: { status: true, clientId: true, sourceText: true },
    }),
    prisma.response.findUniqueOrThrow({
      where: { id: parsed.responseId },
      include: { brand: true, persona: true },
    }),
  ]);

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
  const supportedChannels = ["youtube", "reddit", "x", "facebook", "instagram"];
  if (!supportedChannels.includes(channelLower)) {
    throw new Error(`El canal ${opportunity.channel.name} no soporta publicación automática.`);
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
  result: z.string().min(1).max(80).default("published"),
  followUpNeeded: z.string().optional()
});

export async function markAsPublished(formData: FormData) {
  const parsed = publishSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    publishedUrl: formData.get("publishedUrl") || "",
    result: formData.get("result") || "published",
    followUpNeeded: formData.get("followUpNeeded") || ""
  });

  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: parsed.opportunityId },
    include: { channel: true }
  });

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
        followUpNeeded: parsed.followUpNeeded === "on"
      },
      create: {
        opportunityId: parsed.opportunityId,
        responseId: parsed.responseId,
        publishedUrl: parsed.publishedUrl,
        result: parsed.result,
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
      select: { status: true }
    }),
    prisma.response.findFirst({
      where: { id: parsed.responseId, opportunityId: parsed.opportunityId },
      select: { id: true },
    }),
  ]);

  if (!response) {
    throw new Error("La respuesta no pertenece a esta oportunidad.");
  }

  if (opportunity.status === "PUBLISHED" || opportunity.status === "CONVERTED" || opportunity.status === "FOLLOW_UP") {
    throw new Error("La oportunidad ya está publicada/respondida y no se puede publicar de nuevo.");
  }

  // La publicación directa puede partir de un texto editado en la tarjeta. Se persiste
  // antes de enviar la tarea al relay para que el agente publique exactamente ese texto.
  if (parsed.editedText) {
    await prisma.response.update({
      where: { id: parsed.responseId },
      data: { editedText: parsed.editedText },
    });
  }

  const relayUrl = await getRelayUrl();
  const relayToken = process.env.AGENT_RELAY_TOKEN;

  let agentError: string | null = null;

  let agentPending = false;
  const attemptId = randomUUID();

  if (relayUrl && relayToken) {
    // Path remoto: fire-and-forget al relay (Vercel tiene timeout corto, el relay procesa en background)
    try {
      const resp = await fetch(`${relayUrl.trim()}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${relayToken.trim()}`, // trim() por si tiene \r\n del echo de Windows
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify({
          opportunityId: parsed.opportunityId,
          responseId: parsed.responseId,
          account: parsed.account ?? "",
          attemptId,
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (resp.status === 202) {
        agentPending = true; // flag fuera del try para que redirect() no quede dentro del catch
      } else if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        agentError = (body as { error?: string }).error ?? `relay_http_${resp.status}`;
        logger.warn("publishViaAgent", "Relay respondio con error", { status: resp.status, agentError }).catch(() => {});
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      // Normalizar el error genérico de fetch de Node a un código utilizable.
      if (/fetch\s*failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network\s*error/i.test(raw)) {
        agentError = "relay_fetch_failed";
      } else {
        agentError = "relay_fetch_failed";
      }
      logger.warn("publishViaAgent", "Error conectando al relay", { error: raw }).catch(() => {});
    }
  } else if (process.env.VERCEL || !process.env.AGENT_RELAY_TOKEN) {
    // En Vercel/u entorno serverless sin relay configurado no podemos spawnar el agente local.
    agentError = "relay_not_configured";
    logger.warn("publishViaAgent", "Relay no configurado", { relayUrl, hasToken: !!relayToken }).catch(() => {});
  } else {
    // Path local: spawn directo (desarrollo o servidor local)
    const args = [
      "scripts/publish-response.mjs",
      "--opportunity-id", parsed.opportunityId,
      "--response-id", parsed.responseId
    ];
    if (parsed.account) args.push("--account", parsed.account);

    try {
      const raw = execFileSync("node", args, { cwd: process.cwd(), encoding: "utf-8" });
      const result = JSON.parse(raw.trim().split("\n").pop() ?? "{}");
      if (!result.success) {
        agentError = result.error ?? "unknown";
      }
    } catch (err: unknown) {
      const stdout = (err as { stdout?: string }).stdout ?? "";
      const msg = (err instanceof Error ? err.message : String(err)) + "\n" + stdout;
      const match = msg.match(/"error"\s*:\s*"([^"]+)"/);
      agentError = match ? match[1] : "publish_failed";
      logger.warn("publishViaAgent", "Error al publicar via agente", { error: agentError }).catch(() => {});
    }
  }

  // Extraer y guardar aprendizaje si hubo chat de refinimiento
  const responseWithData = await prisma.response.findUnique({
    where: { id: parsed.responseId },
    include: { opportunity: true, brand: true },
  });
  if (responseWithData && responseWithData.opportunity?.clientId) {
    const chatHistory = (responseWithData.chatHistory as ChatMessage[] | undefined) ?? [];
    if (chatHistory.length > 0) {
      const finalText = responseWithData.editedText || responseWithData.draftText;
      const learning = await extractLearningFromChat({
        opportunityText: responseWithData.opportunity.sourceText,
        finalResponseText: finalText,
        chatHistory: chatHistory.map((m) => ({ sender: m.sender, text: m.text })),
        brandName: responseWithData.brand?.name ?? "",
      });
      if (learning) {
        await addClientMemory(prisma, {
          clientId: responseWithData.opportunity.clientId,
          rule: learning.rule,
          summary: learning.summary,
          category: learning.category,
          source: "chat_refinement",
          opportunityId: parsed.opportunityId,
          responseId: parsed.responseId,
        });
      }
    }
  }

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);

  const client = formData.get("client") as string | null;
  const clientQuery = client ? `&client=${encodeURIComponent(client)}` : "";
  const base = `/opportunities/${parsed.opportunityId}`;
  // redirect() debe estar FUERA de cualquier try/catch (Next.js lo implementa con throw interno)
  if (agentPending) {
    redirect(`${base}?agentPending=1&attemptId=${encodeURIComponent(attemptId)}${clientQuery}`);
  }
  if (agentError) {
    redirect(`${base}?agentError=${encodeURIComponent(agentError)}${clientQuery}`);
  }
  redirect(`${base}?agentOk=1${clientQuery}`);
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
  await deleteClientMemory(prisma, memoryId);
  revalidatePath("/aprendizaje");
}


"use server";

import { execFileSync } from "child_process";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateLocalDrafts } from "@/lib/draft-generator";
import { generateAIDrafts } from "@/lib/ai-draft-generator";
import { loadRelevantKnowledge } from "@/lib/knowledge";
import { loadActivePrompt } from "@/lib/prompts";
import { opportunityIntents, opportunityPriorities, opportunityStatuses } from "@/lib/labels";
import { OpportunityStatus, OpportunityPriority, OpportunityIntent } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getRelayUrl } from "@/lib/settings";
import { loadClientContext, resolveOpportunityClient } from "@/lib/client-context";
import { detectCrossClientTerms, validateClientScopedActors } from "@/lib/guardrails";

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

  const [{ knowledge, objections }, activeSystemPrompt] = await Promise.all([
    loadRelevantKnowledge(prisma, {
      sourceText: opportunity.sourceText,
      clientId: resolution.client.id,
      brandId,
      productId: opportunityForDraft.detectedProductId
    }),
    loadActivePrompt(prisma)
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
  };
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
        draftText: draft.draftText,
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
  approvedBy: z.string().min(1).max(80).default("Fede")
});

export async function approveResponse(formData: FormData) {
  const parsed = approveResponseSchema.parse({
    responseId: formData.get("responseId"),
    opportunityId: formData.get("opportunityId"),
    editedText: formData.get("editedText"),
    approvedBy: formData.get("approvedBy") || "Fede"
  });

  await prisma.$transaction([
    prisma.response.update({
      where: { id: parsed.responseId },
      data: {
        editedText: parsed.editedText,
        approvedBy: parsed.approvedBy
      }
    }),
    prisma.opportunity.update({
      where: { id: parsed.opportunityId },
      data: { status: OpportunityStatus.APPROVED }
    })
  ]);

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
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
    })
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
  account: z.string().optional()
});

export async function publishViaAgent(formData: FormData) {
  const parsed = publishViaAgentSchema.parse({
    opportunityId: formData.get("opportunityId"),
    responseId: formData.get("responseId"),
    account: formData.get("account") || undefined
  });

  const relayUrl = await getRelayUrl();
  const relayToken = process.env.AGENT_RELAY_TOKEN;

  let agentError: string | null = null;

  let agentPending = false;

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
          account: parsed.account ?? ""
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
      agentError = err instanceof Error ? err.message : "relay_fetch_failed";
      logger.warn("publishViaAgent", "Error conectando al relay", { error: agentError }).catch(() => {});
    }
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

  revalidatePath("/");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);

  const client = formData.get("client") as string | null;
  const clientQuery = client ? `&client=${encodeURIComponent(client)}` : "";
  const base = `/opportunities/${parsed.opportunityId}`;
  // redirect() debe estar FUERA de cualquier try/catch (Next.js lo implementa con throw interno)
  if (agentPending) {
    redirect(`${base}?agentPending=1${clientQuery}`);
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


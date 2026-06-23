import { PrismaClient } from "@prisma/client";
import { suggestAllPersonasForClient } from "../src/lib/persona-router.ts";
import { generateLocalDrafts } from "../src/lib/draft-generator.ts";
import { loadRelevantKnowledge } from "../src/lib/knowledge.ts";
import { loadActivePrompt } from "../src/lib/prompts.ts";
import { loadClientContext } from "../src/lib/client-context.ts";
import { detectCrossClientTerms, validateClientScopedActors } from "../src/lib/guardrails.ts";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "prestige-running" } });
  const brand = await prisma.brand.findFirstOrThrow({
    where: { clientId: client.id, name: "Prestige Running" },
  });
  const channel = await prisma.channel.upsert({
    where: { name: "Instagram" },
    update: {},
    create: {
      name: "Instagram",
      type: "reels_comments",
      baseUrl: "https://www.instagram.com",
      responseStyleNotes: "Respuesta breve, visual y conversacional.",
    },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      channelId: channel.id,
      sourceUrl: `https://www.instagram.com/p/test-prestige-multicliente-${Date.now()}`,
      sourceAuthor: "runner_test",
      sourceText: "Estoy preparando mi primer 10K y me salen rozaduras con los soquetes comunes. Para correr conviene media cana o soquete corto?",
      detectedBrandId: brand.id,
      detectedIntent: "PURCHASE_QUESTION",
      priority: "HIGH",
      status: "NEW",
      notes: "TEST multi-cliente Prestige Running: validar que no mezcle PC MIDI.",
    },
    include: {
      channel: true,
      detectedBrand: { include: { client: true } },
      detectedProduct: true,
      monitoredSource: { include: { client: true } },
    },
  });

  const context = await loadClientContext(prisma, client.id, opportunity);
  const suggestions = await suggestAllPersonasForClient(prisma, opportunity, client.id);
  const { knowledge, objections } = await loadRelevantKnowledge(prisma, {
    sourceText: opportunity.sourceText,
    clientId: client.id,
    brandId: brand.id,
    productId: opportunity.detectedProductId,
  });
  const activeSystemPrompt = await loadActivePrompt(prisma);
  const rows = [];

  for (const suggestion of suggestions) {
    const persona = context.personas.find((item) => item.name === suggestion.personaName);
    if (!persona) continue;

    const validation = validateClientScopedActors({ client, brand, persona });
    if (!validation.ok) throw new Error(validation.riskNotes.join("; "));

    const drafts = generateLocalDrafts({
      opportunity,
      brand,
      persona,
      client,
      catalogProducts: context.catalogProducts,
      catalogRules: context.catalogRules,
      knowledge,
      objections,
      activeSystemPrompt,
    });

    for (const draft of drafts) {
      const hits = await detectCrossClientTerms(prisma, client.id, draft.draftText);
      rows.push({
        opportunityId: opportunity.id,
        brandId: brand.id,
        personaId: persona.id,
        variantType: draft.variantType,
        draftText: draft.draftText,
        riskNotes: [
          draft.riskNotes,
          hits.length ? `Posible mezcla: ${hits.join("; ")}` : "",
        ].filter(Boolean).join(" "),
      });
    }
  }

  await prisma.response.createMany({ data: rows });
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: { status: "DRAFTED" },
  });

  console.log(JSON.stringify({
    opportunityId: opportunity.id,
    client: client.slug,
    brand: brand.name,
    personas: suggestions.map((item) => item.personaName),
    drafts: rows.length,
    url: `http://localhost:3000/opportunities/${opportunity.id}`,
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });

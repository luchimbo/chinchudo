import { Prisma, type PrismaClient } from "@prisma/client";

export type OnboardingDraft = {
  name?: string; description?: string; brand?: string; tone?: string; offer?: string;
  topics?: string[]; claims?: string[]; limits?: string[]; knowledge?: string[];
  knowledgePrompts?: string[]; knowledgeApproved?: boolean; selectedNetworks?: string[];
  unsureConfirmed?: boolean;
};

const voices = ["Técnico", "Práctico", "Innovación", "Educativo", "Comercial"];

export function defaultDraft(clientName = ""): Required<OnboardingDraft> {
  return { name: clientName, description: "", brand: clientName, tone: "Claro y cercano", offer: "", topics: [], claims: [], limits: [], knowledge: ["", "", ""], knowledgePrompts: ["Problema que resolvemos", "Cómo elegir una opción", "Pregunta frecuente"], knowledgeApproved: false, selectedNetworks: [], unsureConfirmed: false };
}

export function sanitizeDraft(value: unknown, clientName = ""): Required<OnboardingDraft> {
  const raw = value && typeof value === "object" ? value as OnboardingDraft : {};
  const base = defaultDraft(clientName);
  const strings = (input: unknown, max: number) => Array.isArray(input) ? input.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, max) : [];
  return { ...base, ...raw, name: typeof raw.name === "string" ? raw.name.slice(0, 160) : base.name, description: typeof raw.description === "string" ? raw.description.slice(0, 2000) : base.description, brand: typeof raw.brand === "string" ? raw.brand.slice(0, 160) : base.brand, tone: typeof raw.tone === "string" ? raw.tone.slice(0, 160) : base.tone, offer: typeof raw.offer === "string" ? raw.offer.slice(0, 800) : base.offer, topics: strings(raw.topics, 12), claims: strings(raw.claims, 10), limits: strings(raw.limits, 10), knowledge: strings(raw.knowledge, 3).concat(["", "", ""]).slice(0, 3), knowledgePrompts: strings(raw.knowledgePrompts, 3).concat(base.knowledgePrompts).slice(0, 3), selectedNetworks: strings(raw.selectedNetworks, 8), knowledgeApproved: raw.knowledgeApproved === true, unsureConfirmed: raw.unsureConfirmed === true };
}

export function generatedKnowledge(draft: Required<OnboardingDraft>, kind: string) {
  const brand = draft.brand || draft.name || "La marca";
  const topic = draft.topics[0] || "la necesidad de cada persona";
  const offer = draft.offer || "su oferta";
  const limit = draft.limits[0]?.toLowerCase() || "no afirmar datos no confirmados";
  const content: Record<string, string> = {
    "Problema que resolvemos": `${brand} ayuda a quienes buscan ${topic} mediante ${offer}. La prioridad es entender el caso y orientar una solución útil, sin presión comercial.`,
    "Cómo elegir una opción": `Para elegir una opción, ${brand} primero entiende el uso esperado y luego compara alternativas según ${topic}. La recomendación debe centrarse en ${offer}.`,
    "Pregunta frecuente": `Una pregunta frecuente es cómo saber si ${offer} es adecuado. ${brand} debe pedir contexto antes de recomendar y ${limit}.`,
  };
  return content[kind] ?? `${brand} responde sobre ${kind.toLowerCase()} con información confirmada de ${offer}.`;
}

export async function syncOnboarding(prisma: PrismaClient, clientId: string, draft: Required<OnboardingDraft>) {
  await prisma.$transaction(async tx => {
    await tx.client.update({ where: { id: clientId }, data: { name: draft.name || undefined, description: draft.description, domainKeywords: JSON.stringify(draft.topics), responsePolicy: { tone: draft.tone, claims: draft.claims, limits: draft.limits } } });
    if (!draft.brand.trim()) return;
    const brand = await tx.brand.upsert({ where: { clientId_name: { clientId, name: draft.brand } }, create: { clientId, name: draft.brand, strengths: draft.offer, tone: draft.tone, allowedClaims: draft.claims.join("\n"), forbiddenClaims: draft.limits.join("\n") }, update: { strengths: draft.offer, tone: draft.tone, allowedClaims: draft.claims.join("\n"), forbiddenClaims: draft.limits.join("\n") } });
    await Promise.all(voices.map(name => tx.persona.upsert({ where: { clientId_name: { clientId, name } }, create: { clientId, name, role: name, tone: draft.tone, goals: `Representar a ${draft.brand} con información confirmada.`, preferredLength: "Media", allowedPhrases: draft.claims.join("\n"), forbiddenPhrases: draft.limits.join("\n") }, update: { tone: draft.tone, allowedPhrases: draft.claims.join("\n"), forbiddenPhrases: draft.limits.join("\n") } })));
    if (draft.knowledgeApproved) {
      await tx.knowledgeBase.deleteMany({ where: { clientId, source: "onboarding" } });
      await tx.knowledgeBase.createMany({ data: draft.knowledge.filter(Boolean).map((content, i) => ({ clientId, brandId: brand.id, topic: draft.knowledgePrompts[i] || `Conocimiento ${i + 1}`, content, source: "onboarding", confidence: "high" })) });
    }
    for (const channel of draft.selectedNetworks) {
      const query = `${draft.brand || draft.name} ${draft.offer || draft.topics[0] || "consultas"}`.slice(0, 400);
      await tx.monitoredSource.upsert({ where: { label: `${clientId}:onboarding:${channel}` }, create: { clientId, label: `${clientId}:onboarding:${channel}`, channel, query, expectedTopics: draft.topics }, update: { query, expectedTopics: draft.topics, active: true } });
    }
  });
}

export async function analyzePublicWebsite(url: string, clientName: string): Promise<Required<OnboardingDraft>> {
  const fallback = defaultDraft(clientName);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow", headers: { "User-Agent": "Cafishia onboarding analysis" } });
  if (!response.ok) throw new Error("No pudimos leer el sitio. Podés completar los datos manualmente.");
  const html = (await response.text()).slice(0, 150000);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || clientName;
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() || "";
  return { ...fallback, name: title.slice(0, 160), brand: title.slice(0, 160), description: description.slice(0, 2000), topics: description ? ["asesoramiento personalizado", "soluciones prácticas", "compra informada"] : [] };
}

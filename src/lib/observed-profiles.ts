import type { OpportunityIntent, OpportunityPriority, Prisma, PrismaClient } from "@prisma/client";

export type ToneProfile =
  | "casual"
  | "technical"
  | "formal"
  | "aspirational"
  | "direct"
  | "mixed";

export type TopicClassification = {
  primaryTopic: string;
  secondaryTopics: string[];
  confidence: "high" | "medium" | "low";
  matchedKeywords: string[];
  tone: ToneProfile;
  toneConfidence: "high" | "medium" | "low";
  signalSummary: string;
};

export type ObservedInterestSignal = {
  topicKey: string;
  weight: number;
  confidence: string;
  lastSeenAt: Date;
  evidenceCount: number;
};

export type ObservedProfileSummary = {
  id: string;
  platform: string;
  externalHandle: string;
  displayName: string;
  toneSummary: string;
  toneConfidence: string;
  primaryTopics: string[];
  secondaryTopics: string[];
  commercialReadiness: number;
  engagementPattern: {
    totalEvents: number;
    recentEvents: number;
    activeHours: number[];
    dominantIntent: string;
  };
};

export type ProfileContextForDraft = {
  currentTopic: string;
  currentTopicConfidence: "high" | "medium" | "low";
  historicalPrimaryTopics: string[];
  historicalSecondaryTopics: string[];
  toneProfile: ToneProfile;
  toneConfidence: "high" | "medium" | "low";
  commercialReadiness: number;
  signalSummary: string;
};

export type VoiceModulation = {
  styleLabel: string;
  introStyle: string;
  phrasingStyle: string;
  ctaStyle: string;
  guardrail: string;
};

type TopicDefinition = {
  key: string;
  keywords: string[];
};

const TOPIC_TAXONOMY: TopicDefinition[] = [
  { key: "running", keywords: ["running", "runner", "correr", "maraton", "10k", "21k", "entrenamiento"] },
  { key: "trail", keywords: ["trail", "sendero", "montana", "trekking", "barro"] },
  { key: "compresion", keywords: ["compresion", "compression", "pantorrillera", "15-20", "mm hg", "circulacion"] },
  { key: "futbol", keywords: ["futbol", "botines", "cancha", "partido"] },
  { key: "pianos", keywords: ["piano", "teclado", "keyboard", "88 teclas", "digital piano"] },
  { key: "controladores-midi", keywords: ["midi", "controlador", "minilab", "ableton", "fl studio", "launchkey"] },
  { key: "interfaces-audio", keywords: ["interfaz", "interface", "placa", "latencia", "asio", "grabar"] },
  { key: "baterias-electronicas", keywords: ["bateria", "drum", "parche", "malla", "rebote"] },
  { key: "home-studio", keywords: ["home studio", "daw", "mezcla", "grabacion", "produccion", "vst"] },
  { key: "abogacia", keywords: ["abogacia", "abogado", "juridico", "ley", "tribunal", "contrato"] },
  { key: "educacion", keywords: ["alumno", "clase", "aprender", "profe", "escuela", "principiante"] },
  { key: "general", keywords: [] },
];

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferTone(text: string): Pick<TopicClassification, "tone" | "toneConfidence"> {
  const normalized = normalize(text);
  const exclamations = (text.match(/[!?]/g) || []).length;
  const technicalHits = ["driver", "compatib", "latencia", "configur", "mm hg", "especific", "garantia"].filter((term) => normalized.includes(term)).length;
  const aspirationalHits = ["premium", "diseno", "estetica", "la rompe", "tremendo"].filter((term) => normalized.includes(term)).length;
  const formalHits = ["quisiera", "agradeceria", "estimados", "consulta"].filter((term) => normalized.includes(term)).length;
  const directHits = ["cuanto", "precio", "stock", "link", "donde", "ya"].filter((term) => normalized.includes(term)).length;

  if (technicalHits >= 2) return { tone: "technical", toneConfidence: "high" };
  if (aspirationalHits >= 2) return { tone: "aspirational", toneConfidence: "medium" };
  if (formalHits >= 2) return { tone: "formal", toneConfidence: "medium" };
  if (directHits >= 2) return { tone: "direct", toneConfidence: "medium" };
  if (exclamations > 1 || /\b(che|jaja|posta|copado|buenisimo)\b/.test(normalized)) return { tone: "casual", toneConfidence: "medium" };
  return { tone: "mixed", toneConfidence: "low" };
}

export function classifyObservedText(input: {
  text: string;
  detectedIntent?: OpportunityIntent | string | null;
  priority?: OpportunityPriority | string | null;
}): TopicClassification {
  const text = normalize(input.text);
  const scores = TOPIC_TAXONOMY
    .map((topic) => {
      const matchedKeywords = topic.keywords.filter((keyword) => text.includes(normalize(keyword)));
      return { key: topic.key, score: matchedKeywords.length, matchedKeywords };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = scores[0];
  const secondary = scores.slice(1, 4).map((entry) => entry.key);
  const tone = inferTone(input.text);
  const confidence: TopicClassification["confidence"] =
    !primary ? "low" : primary.score >= 3 ? "high" : primary.score === 2 ? "medium" : "low";

  const signalSummaryParts = [
    primary ? `tema actual: ${primary.key}` : "tema actual ambiguo",
    secondary.length > 0 ? `secundarios: ${secondary.join(", ")}` : "",
    input.detectedIntent ? `intent: ${input.detectedIntent}` : "",
    input.priority ? `priority: ${input.priority}` : "",
    `tono: ${tone.tone}`,
  ].filter(Boolean);

  return {
    primaryTopic: primary?.key ?? "general",
    secondaryTopics: secondary,
    confidence,
    matchedKeywords: primary?.matchedKeywords ?? [],
    tone: tone.tone,
    toneConfidence: tone.toneConfidence,
    signalSummary: signalSummaryParts.join(" | "),
  };
}

function safeHandle(value: string) {
  const normalized = normalize(value).replace(/^[@\s]+/, "").trim();
  return normalized || "unknown";
}

export async function ensureObservedProfile(
  prisma: PrismaClient,
  input: {
    clientId: string;
    platform: string;
    externalHandle?: string | null;
    displayName?: string | null;
    profileUrl?: string | null;
    seenAt?: Date;
  },
) {
  const externalHandle = safeHandle(input.externalHandle || input.displayName || input.profileUrl || "unknown");
  const now = input.seenAt ?? new Date();
  return prisma.observedProfile.upsert({
    where: {
      clientId_platform_externalHandle: {
        clientId: input.clientId,
        platform: normalize(input.platform),
        externalHandle,
      },
    },
    update: {
      displayName: input.displayName || undefined,
      profileUrl: input.profileUrl || undefined,
      lastSeenAt: now,
    },
    create: {
      clientId: input.clientId,
      platform: normalize(input.platform),
      externalHandle,
      displayName: input.displayName || "",
      profileUrl: input.profileUrl || "",
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
}

function recencyAdjustedWeight(lastSeenAt: Date, weight: number) {
  const ageDays = Math.max(0, (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24));
  const multiplier = ageDays > 30 ? 0.5 : ageDays > 14 ? 0.7 : ageDays > 7 ? 0.85 : 1;
  return weight * multiplier;
}

function confidenceToWeight(confidence: string) {
  if (confidence === "high") return 1.2;
  if (confidence === "medium") return 1;
  return 0.7;
}

export async function recordObservedProfileEvent(
  prisma: PrismaClient,
  input: {
    opportunityId: string;
    clientId: string;
    platform: string;
    sourceAuthor?: string | null;
    sourceText: string;
    sourceUrl: string;
    detectedIntent: OpportunityIntent;
    priority: OpportunityPriority;
    createdAt?: Date;
    overrideClassification?: Partial<TopicClassification>;
  },
) {
  const classification = {
    ...classifyObservedText({
      text: input.sourceText,
      detectedIntent: input.detectedIntent,
      priority: input.priority,
    }),
    ...input.overrideClassification,
  } as TopicClassification;
  const observedProfile = await ensureObservedProfile(prisma, {
    clientId: input.clientId,
    platform: input.platform,
    externalHandle: input.sourceAuthor,
    displayName: input.sourceAuthor,
    profileUrl: input.sourceUrl,
    seenAt: input.createdAt,
  });

  await prisma.observedEvent.upsert({
    where: { opportunityId: input.opportunityId },
    update: {
      observedProfileId: observedProfile.id,
      sourceTextSnapshot: input.sourceText,
      primaryTopicKey: classification.primaryTopic,
      secondaryTopicKeys: classification.secondaryTopics,
      topicConfidence: classification.confidence,
      toneSummary: classification.tone,
      toneConfidence: classification.toneConfidence,
      detectedIntent: input.detectedIntent,
      detectedPriority: input.priority,
      signalSummary: classification.signalSummary,
    },
    create: {
      observedProfileId: observedProfile.id,
      opportunityId: input.opportunityId,
      sourceTextSnapshot: input.sourceText,
      primaryTopicKey: classification.primaryTopic,
      secondaryTopicKeys: classification.secondaryTopics,
      topicConfidence: classification.confidence,
      toneSummary: classification.tone,
      toneConfidence: classification.toneConfidence,
      detectedIntent: input.detectedIntent,
      detectedPriority: input.priority,
      signalSummary: classification.signalSummary,
    },
  });

  const touchedTopics = [classification.primaryTopic, ...classification.secondaryTopics];
  const now = input.createdAt ?? new Date();
  for (const topicKey of touchedTopics) {
    const boost = topicKey === classification.primaryTopic ? 2 : 0.9;
    await prisma.observedInterest.upsert({
      where: {
        observedProfileId_topicKey: {
          observedProfileId: observedProfile.id,
          topicKey,
        },
      },
      update: {
        weight: { increment: boost * confidenceToWeight(classification.confidence) },
        confidence: classification.confidence,
        lastSeenAt: now,
        evidenceCount: { increment: 1 },
      },
      create: {
        observedProfileId: observedProfile.id,
        topicKey,
        weight: boost * confidenceToWeight(classification.confidence),
        confidence: classification.confidence,
        firstSeenAt: now,
        lastSeenAt: now,
        evidenceCount: 1,
      },
    });
  }

  await prisma.opportunity.update({
    where: { id: input.opportunityId },
    data: {
      observedProfileId: observedProfile.id,
      detectedTopics: [classification.primaryTopic, ...classification.secondaryTopics],
      detectedTone: classification.tone,
      detectedToneConfidence: classification.toneConfidence,
    },
  });

  await refreshObservedProfileAggregate(prisma, observedProfile.id);
  return observedProfile;
}

export async function refreshObservedProfileAggregate(prisma: PrismaClient, observedProfileId: string) {
  const profile = await prisma.observedProfile.findUnique({
    where: { id: observedProfileId },
    include: {
      interests: true,
      events: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!profile) return null;

  const weightedTopics = profile.interests
    .map((interest) => ({
      topicKey: interest.topicKey,
      score: recencyAdjustedWeight(interest.lastSeenAt, interest.weight),
      lastSeenAt: interest.lastSeenAt,
      confidence: interest.confidence,
      evidenceCount: interest.evidenceCount,
    }))
    .sort((a, b) => b.score - a.score);

  const primaryTopics = weightedTopics.slice(0, 3).map((topic) => topic.topicKey);
  const secondaryTopics = weightedTopics.slice(3, 6).map((topic) => topic.topicKey);

  const toneCounter = new Map<string, number>();
  const intentCounter = new Map<string, number>();
  const activeHours = new Set<number>();
  let recentEvents = 0;

  for (const event of profile.events) {
    toneCounter.set(event.toneSummary, (toneCounter.get(event.toneSummary) ?? 0) + 1);
    intentCounter.set(event.detectedIntent, (intentCounter.get(event.detectedIntent) ?? 0) + 1);
    activeHours.add(event.createdAt.getHours());
    if (Date.now() - event.createdAt.getTime() <= 1000 * 60 * 60 * 24 * 14) recentEvents += 1;
  }

  const dominantTone = [...toneCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed";
  const dominantIntent = [...intentCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "GENERAL_DISCUSSION";
  const commercialReadiness = Math.min(
    100,
    Math.round(
      profile.events.reduce((sum, event) => {
        const priorityBoost = event.detectedPriority === "URGENT" ? 20 : event.detectedPriority === "HIGH" ? 12 : event.detectedPriority === "MEDIUM" ? 6 : 2;
        const intentBoost = ["PURCHASE_QUESTION", "PRICE_QUESTION", "WARRANTY_QUESTION"].includes(event.detectedIntent) ? 8 : 2;
        return sum + priorityBoost + intentBoost;
      }, 0) / Math.max(1, profile.events.length),
    ),
  );

  const toneConfidence = toneCounter.get(dominantTone) && (toneCounter.get(dominantTone) ?? 0) >= 3
    ? "high"
    : (toneCounter.get(dominantTone) ?? 0) >= 2
      ? "medium"
      : "low";

  return prisma.observedProfile.update({
    where: { id: observedProfileId },
    data: {
      toneSummary: dominantTone,
      toneConfidence,
      primaryTopics,
      secondaryTopics,
      commercialReadiness,
      engagementPattern: {
        totalEvents: profile.events.length,
        recentEvents,
        activeHours: [...activeHours].sort((a, b) => a - b),
        dominantIntent,
      },
      lastSeenAt: profile.events[0]?.createdAt ?? profile.lastSeenAt,
    },
  });
}

export async function loadObservedProfileContext(
  prisma: PrismaClient,
  opportunityId: string,
): Promise<ProfileContextForDraft | null> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      observedProfile: true,
      observedEvent: true,
    },
  });
  if (!opportunity?.observedProfile || !opportunity.observedEvent) return null;

  return {
    currentTopic: opportunity.observedEvent.primaryTopicKey,
    currentTopicConfidence: (opportunity.observedEvent.topicConfidence as ProfileContextForDraft["currentTopicConfidence"]) || "low",
    historicalPrimaryTopics: Array.isArray(opportunity.observedProfile.primaryTopics) ? opportunity.observedProfile.primaryTopics as string[] : [],
    historicalSecondaryTopics: Array.isArray(opportunity.observedProfile.secondaryTopics) ? opportunity.observedProfile.secondaryTopics as string[] : [],
    toneProfile: (opportunity.observedProfile.toneSummary as ToneProfile) || "mixed",
    toneConfidence: (opportunity.observedProfile.toneConfidence as ProfileContextForDraft["toneConfidence"]) || "low",
    commercialReadiness: opportunity.observedProfile.commercialReadiness,
    signalSummary: opportunity.observedEvent.signalSummary,
  };
}

export async function loadObservedProfileSummary(
  prisma: PrismaClient,
  observedProfileId: string,
): Promise<ObservedProfileSummary | null> {
  const profile = await prisma.observedProfile.findUnique({ where: { id: observedProfileId } });
  if (!profile) return null;
  const engagementPattern = (profile.engagementPattern || {}) as ObservedProfileSummary["engagementPattern"];

  return {
    id: profile.id,
    platform: profile.platform,
    externalHandle: profile.externalHandle,
    displayName: profile.displayName,
    toneSummary: profile.toneSummary,
    toneConfidence: profile.toneConfidence,
    primaryTopics: Array.isArray(profile.primaryTopics) ? profile.primaryTopics as string[] : [],
    secondaryTopics: Array.isArray(profile.secondaryTopics) ? profile.secondaryTopics as string[] : [],
    commercialReadiness: profile.commercialReadiness,
    engagementPattern: {
      totalEvents: Number(engagementPattern.totalEvents ?? 0),
      recentEvents: Number(engagementPattern.recentEvents ?? 0),
      activeHours: Array.isArray(engagementPattern.activeHours) ? engagementPattern.activeHours.map(Number) : [],
      dominantIntent: String(engagementPattern.dominantIntent ?? "GENERAL_DISCUSSION"),
    },
  };
}

export function getObservedProfileDraftHints(context: ProfileContextForDraft | null) {
  if (!context) return [];
  const hints = [
    `Tema actual detectado: ${context.currentTopic}`,
    context.historicalPrimaryTopics.length > 0 ? `Intereses historicos: ${context.historicalPrimaryTopics.join(", ")}` : "",
    context.toneConfidence !== "low" ? `Tono historico de la cuenta: ${context.toneProfile}` : "",
    context.commercialReadiness >= 50 ? "Cuenta con alta senal comercial reciente" : "",
  ].filter(Boolean);
  return hints;
}

export function deriveVoiceModulation(context?: ProfileContextForDraft | null): VoiceModulation {
  if (!context) {
    return {
      styleLabel: "base",
      introStyle: "Mantene la voz base de la persona, sin sobreactuar.",
      phrasingStyle: "Usa frases naturales y especificas al comentario actual.",
      ctaStyle: "Cierre simple, sin empujar de mas.",
      guardrail: "No inventes afinidad si el historial no alcanza.",
    };
  }

  const hobbyBias = context.historicalPrimaryTopics.some((topic) => topic !== context.currentTopic);
  if (context.toneProfile === "casual") {
    return {
      styleLabel: "casual",
      introStyle: hobbyBias
        ? "Entra cercano y relajado, como alguien que comparte hobby o experiencia real."
        : "Entra cercano y relajado, sin rigidez.",
      phrasingStyle: "Usa frases cortas, concretas y con tono conversacional.",
      ctaStyle: "Cierre amable, mas de recomendacion que de venta.",
      guardrail: "No conviertas lo casual en exagerado ni metas temas historicos en el contenido principal.",
    };
  }
  if (context.toneProfile === "technical") {
    return {
      styleLabel: "technical",
      introStyle: "Entra claro y confiable, priorizando precision antes que entusiasmo.",
      phrasingStyle: "Usa lenguaje tecnico pero entendible, con foco en uso real.",
      ctaStyle: "Cierre util y concreto, sin adornos.",
      guardrail: "No te pongas demasiado frio ni enumeres specs irrelevantes.",
    };
  }
  if (context.toneProfile === "formal") {
    return {
      styleLabel: "formal",
      introStyle: "Entra prolijo y respetuoso, con tono mas ordenado.",
      phrasingStyle: "Usa frases completas y limpias, evitando slang.",
      ctaStyle: "Cierre sobrio, orientado a resolver.",
      guardrail: "No pierdas naturalidad ni suenes corporativo.",
    };
  }
  if (context.toneProfile === "direct") {
    return {
      styleLabel: "direct",
      introStyle: "Entra rapido al punto, sin rodeos.",
      phrasingStyle: "Usa frases cortas y accionables.",
      ctaStyle: "Cierre firme y simple.",
      guardrail: "No lo vuelvas brusco ni comercial de mas.",
    };
  }
  if (context.toneProfile === "aspirational") {
    return {
      styleLabel: "aspirational",
      introStyle: "Entra con tono entusiasta y de apreciacion por diseño/experiencia.",
      phrasingStyle: "Usa palabras que eleven la percepcion sin exagerar claims.",
      ctaStyle: "Cierre inspirador pero aterrizado.",
      guardrail: "No inventes premiumidad ni prometas mas de lo que esta verificado.",
    };
  }

  return {
    styleLabel: "mixed",
    introStyle: "Mantene una entrada equilibrada, clara y humana.",
    phrasingStyle: "Usa frases naturales y especificas, sin modular demasiado.",
    ctaStyle: "Cierre simple y util.",
    guardrail: "Usa el historial solo como ayuda ligera de tono.",
  };
}

export async function overrideObservedProfileSignals(
  prisma: PrismaClient,
  input: {
    opportunityId: string;
    primaryTopic: string;
    secondaryTopics: string[];
    topicConfidence: "high" | "medium" | "low";
    tone: ToneProfile;
    toneConfidence: "high" | "medium" | "low";
  },
) {
  const event = await prisma.observedEvent.findUnique({
    where: { opportunityId: input.opportunityId },
    include: { observedProfile: true, opportunity: true },
  });
  if (!event) return null;

  await prisma.observedEvent.update({
    where: { opportunityId: input.opportunityId },
    data: {
      primaryTopicKey: input.primaryTopic,
      secondaryTopicKeys: input.secondaryTopics,
      topicConfidence: input.topicConfidence,
      toneSummary: input.tone,
      toneConfidence: input.toneConfidence,
      signalSummary: `override manual | tema actual: ${input.primaryTopic} | secundarios: ${input.secondaryTopics.join(", ") || "ninguno"} | tono: ${input.tone}`,
    },
  });

  await prisma.opportunity.update({
    where: { id: input.opportunityId },
    data: {
      detectedTopics: [input.primaryTopic, ...input.secondaryTopics],
      detectedTone: input.tone,
      detectedToneConfidence: input.toneConfidence,
    },
  });

  await prisma.observedInterest.upsert({
    where: {
      observedProfileId_topicKey: {
        observedProfileId: event.observedProfileId,
        topicKey: input.primaryTopic,
      },
    },
    update: {
      weight: { increment: 2.5 },
      confidence: input.topicConfidence,
      lastSeenAt: event.opportunity.createdAt,
      evidenceCount: { increment: 1 },
    },
    create: {
      observedProfileId: event.observedProfileId,
      topicKey: input.primaryTopic,
      weight: 2.5,
      confidence: input.topicConfidence,
      firstSeenAt: event.opportunity.createdAt,
      lastSeenAt: event.opportunity.createdAt,
      evidenceCount: 1,
    },
  });

  await refreshObservedProfileAggregate(prisma, event.observedProfileId);
  return loadObservedProfileContext(prisma, input.opportunityId);
}

export const OBSERVED_TOPIC_KEYS = TOPIC_TAXONOMY.map((topic) => topic.key);

export function jsonArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

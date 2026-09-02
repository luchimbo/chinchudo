import { describe, expect, it, vi } from "vitest";
import { OnboardingNameConflictError, sanitizeDraft, syncOnboarding } from "@/lib/onboarding";

/** Fake mínimo de PrismaClient con lo que syncOnboarding necesita dentro de $transaction. */
function makeFakePrisma(options: {
  clientName?: string;
  clientDescription?: string;
  clientTopics?: string[];
  responsePolicy?: Record<string, unknown>;
  nameConflict?: boolean;
  knowledgeRows?: { id: string; topic: string }[];
  monitoredSourceTopics?: Record<string, unknown[]>;
} = {}) {
  const personas = new Map<string, { clientId: string; name: string; tone: string; goals: string; allowedPhrases: string; forbiddenPhrases: string }>();
  const knowledgeRows = new Map(
    (options.knowledgeRows || []).map((row) => [row.id, { ...row, content: "" }]),
  );
  const state = {
    clientUpdates: [] as any[],
    brandUpserts: [] as any[],
    personaCreates: [] as any[],
    onboardingUpdates: [] as any[],
    monitoredSourceUpserts: [] as any[],
    knowledgeCreates: [] as any[],
    knowledgeUpdates: [] as any[],
    knowledgeDeletes: [] as any[],
  };
  const tx = {
    client: {
      findUnique: vi.fn(async () => ({
        name: options.clientName ?? "",
        description: options.clientDescription ?? "",
        domainKeywords: JSON.stringify(options.clientTopics ?? []),
        responsePolicy: options.responsePolicy ?? {},
      })),
      findFirst: vi.fn(async () => (options.nameConflict ? { id: "other-client" } : null)),
      update: vi.fn(async (args: any) => {
        state.clientUpdates.push(args);
        return { id: args.where.id, ...args.data };
      }),
    },
    brand: {
      upsert: vi.fn(async (args: any) => {
        state.brandUpserts.push(args);
        return { id: "brand-1", clientId: args.where.clientId_name.clientId, name: args.where.clientId_name.name };
      }),
    },
    product: { upsert: vi.fn(async () => ({})) },
    service: { upsert: vi.fn(async () => ({})) },
    persona: {
      findUnique: vi.fn(async (args: any) => {
        const key = `${args.where.clientId_name.clientId}:${args.where.clientId_name.name}`;
        return personas.get(key) || null;
      }),
      create: vi.fn(async (args: any) => {
        state.personaCreates.push(args);
        const key = `${args.data.clientId}:${args.data.name}`;
        personas.set(key, args.data);
        return args.data;
      }),
    },
    knowledgeBase: {
      findMany: vi.fn(async () => [...knowledgeRows.values()].map(({ id, topic }) => ({ id, topic }))),
      update: vi.fn(async (args: any) => {
        state.knowledgeUpdates.push(args);
        const row = knowledgeRows.get(args.where.id);
        if (row) Object.assign(row, args.data);
        return row;
      }),
      create: vi.fn(async (args: any) => {
        state.knowledgeCreates.push(args);
        const id = `kb-${knowledgeRows.size + 1}`;
        knowledgeRows.set(id, { id, topic: args.data.topic, content: args.data.content });
        return { id, ...args.data };
      }),
      deleteMany: vi.fn(async (args: any) => {
        state.knowledgeDeletes.push(args);
        const ids: string[] = args.where?.id?.in || [];
        for (const id of ids) knowledgeRows.delete(id);
        return { count: ids.length };
      }),
    },
    monitoredSource: {
      findUnique: vi.fn(async (args: any) => {
        const channel = args.where.label.split(":onboarding:")[1];
        const topics = options.monitoredSourceTopics?.[channel];
        return topics ? { expectedTopics: topics } : null;
      }),
      upsert: vi.fn(async (args: any) => {
        state.monitoredSourceUpserts.push(args);
        return {};
      }),
    },
    clientOnboarding: {
      update: vi.fn(async (args: any) => {
        state.onboardingUpdates.push(args);
        return args;
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => callback(tx)),
  };
  return { prisma: prisma as any, tx, state, personas };
}

describe("syncOnboarding", () => {
  it("crea las 5 personas cuando ninguna existe todavía", async () => {
    const { prisma, state } = makeFakePrisma();
    const draft = sanitizeDraft({ name: "Cliente", brand: "Marca", tone: "Cercano" });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.personaCreates).toHaveLength(5);
    expect(state.personaCreates.map((call) => call.data.name).sort()).toEqual(
      ["Comercial", "Educativo", "Innovación", "Práctico", "Técnico"],
    );
  });

  it("no modifica el tono ni los objetivos de personas ya confirmadas con voces distintas", async () => {
    const { prisma, tx, state, personas } = makeFakePrisma();
    const existingTones: Record<string, string> = {
      "Técnico": "Preciso y técnico",
      "Práctico": "Cotidiano y cercano",
      "Innovación": "Moderno y curioso",
      "Educativo": "Didáctico y simple",
      "Comercial": "Directo y entusiasta",
    };
    for (const [name, tone] of Object.entries(existingTones)) {
      personas.set(`client-1:${name}`, {
        clientId: "client-1",
        name,
        tone,
        goals: `Objetivo original de ${name}`,
        allowedPhrases: "",
        forbiddenPhrases: "",
      });
    }
    const draft = sanitizeDraft({ name: "Cliente", brand: "Marca", tone: "Un tono uniforme que no debería pisar nada" });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.personaCreates).toHaveLength(0);
    expect(tx.persona.create).not.toHaveBeenCalled();
    for (const [name, tone] of Object.entries(existingTones)) {
      expect(personas.get(`client-1:${name}`)?.tone).toBe(tone);
    }
  });

  it("marca el onboarding como COMPLETED dentro de la misma transacción cuando se pasa completeOnboardingId", async () => {
    const { prisma, state } = makeFakePrisma();
    const draft = sanitizeDraft({ name: "Cliente", brand: "Marca" });
    await syncOnboarding(prisma, "client-1", draft, { completeOnboardingId: "onboarding-1" });
    expect(state.onboardingUpdates).toHaveLength(1);
    expect(state.onboardingUpdates[0].where.id).toBe("onboarding-1");
    expect(state.onboardingUpdates[0].data.status).toBe("COMPLETED");
  });

  it("no toca personas ni onboarding cuando no hay marca (draft.brand vacío)", async () => {
    const { prisma, state } = makeFakePrisma();
    const draft = sanitizeDraft({ name: "Cliente", brand: "" });
    await syncOnboarding(prisma, "client-1", draft, { completeOnboardingId: "onboarding-1" });
    expect(state.personaCreates).toHaveLength(0);
    expect(state.onboardingUpdates).toHaveLength(1);
  });

  it("mergea responsePolicy en vez de reemplazarlo: conserva claves ajenas", async () => {
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      responsePolicy: { identity: "advisor", inferenceMode: "literal" },
    });
    const draft = sanitizeDraft({ name: "Cliente", brand: "Marca", tone: "Cercano" });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.clientUpdates).toHaveLength(1);
    expect(state.clientUpdates[0].data.responsePolicy).toMatchObject({
      identity: "advisor",
      inferenceMode: "literal",
      tone: "Cercano",
    });
  });

  it("no escribe Client cuando el draft es idéntico a lo ya confirmado (no-op verificable)", async () => {
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      clientDescription: "Descripción confirmada",
      clientTopics: ["running", "medias"],
      responsePolicy: {
        tone: "Cercano",
        claims: [],
        limits: [],
        targetAudience: "",
        businessGoals: [],
      },
    });
    const draft = sanitizeDraft({
      name: "Cliente",
      description: "Descripción confirmada",
      topics: ["running", "medias"],
      tone: "Cercano",
      brand: "",
    });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.clientUpdates).toHaveLength(0);
  });

  it("no pisa domainKeywords con una lista truncada por el clipping de sanitizeDraft", async () => {
    const fullTopics = Array.from({ length: 45 }, (_, i) => `tema-${i}`);
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      clientTopics: fullTopics, // el dominio tiene 45, más que el tope de 40
    });
    // El draft llega con el mismo sitio pero ya truncado a 40 por sanitizeDraft.
    const draft = sanitizeDraft({ name: "Cliente", topics: fullTopics, brand: "" });
    expect(draft.topics).toHaveLength(40);
    await syncOnboarding(prisma, "client-1", draft);
    const domainKeywordsWrite = state.clientUpdates.find((call) => "domainKeywords" in call.data);
    expect(domainKeywordsWrite).toBeUndefined();
  });

  it("rechaza activar con un nombre que ya usa otro cliente", async () => {
    const { prisma } = makeFakePrisma({ clientName: "Nombre viejo", nameConflict: true });
    const draft = sanitizeDraft({ name: "Nombre nuevo", brand: "Marca" });
    await expect(syncOnboarding(prisma, "client-1", draft)).rejects.toThrow(
      OnboardingNameConflictError,
    );
  });

  it("preserva el id de una fila de conocimiento cuyo topic sigue vigente", async () => {
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      knowledgeRows: [{ id: "kb-existing", topic: "Problema que resolvemos" }],
    });
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      knowledge: ["Contenido editado", "", ""],
      knowledgePrompts: ["Problema que resolvemos", "Cómo elegir una opción", "Pregunta frecuente"],
      knowledgeApproved: true,
    });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.knowledgeUpdates).toHaveLength(1);
    expect(state.knowledgeUpdates[0].where.id).toBe("kb-existing");
    expect(state.knowledgeUpdates[0].data.content).toBe("Contenido editado");
    expect(state.knowledgeCreates).toHaveLength(0);
    expect(state.knowledgeDeletes).toHaveLength(0);
  });

  it("borra sólo las filas de conocimiento cuyo topic ya no corresponde a ningún slot", async () => {
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      knowledgeRows: [{ id: "kb-stale", topic: "Topic viejo que ya no existe" }],
    });
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      knowledge: ["Contenido nuevo", "", ""],
      knowledgePrompts: ["Problema que resolvemos", "Cómo elegir una opción", "Pregunta frecuente"],
      knowledgeApproved: true,
    });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.knowledgeCreates).toHaveLength(1);
    expect(state.knowledgeDeletes).toHaveLength(1);
    expect(state.knowledgeDeletes[0].where.id.in).toEqual(["kb-stale"]);
  });

  it("no pisa el query afinado a mano de un MonitoredSource cuando los topics no cambiaron", async () => {
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      monitoredSourceTopics: { Instagram: ["running", "medias"] },
    });
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      topics: ["running", "medias"],
      selectedNetworks: ["Instagram"],
    });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.monitoredSourceUpserts).toHaveLength(1);
    expect(state.monitoredSourceUpserts[0].update).toEqual({ active: true });
  });

  it("actualiza query y expectedTopics de un MonitoredSource cuando los topics cambiaron", async () => {
    const { prisma, state } = makeFakePrisma({
      clientName: "Cliente",
      monitoredSourceTopics: { Instagram: ["viejo"] },
    });
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      topics: ["running", "medias"],
      selectedNetworks: ["Instagram"],
    });
    await syncOnboarding(prisma, "client-1", draft);
    expect(state.monitoredSourceUpserts[0].update).toMatchObject({
      active: true,
      expectedTopics: ["running", "medias"],
    });
  });

  it("no importa una oferta deseleccionada (offering.selected === false)", async () => {
    const { prisma, tx } = makeFakePrisma({ clientName: "Cliente" });
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      offerings: [
        { id: "p1", kind: "product", name: "Producto elegido", selected: true, evidence: { url: "", status: "manual", confidence: "high" } },
        { id: "p2", kind: "product", name: "Producto descartado", selected: false, evidence: { url: "", status: "manual", confidence: "high" } },
      ] as any,
    });
    await syncOnboarding(prisma, "client-1", draft);
    expect(tx.product.upsert).toHaveBeenCalledTimes(1);
    expect((tx.product.upsert as any).mock.calls[0][0].create.name).toBe("Producto elegido");
  });
});

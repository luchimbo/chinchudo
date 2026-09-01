import { describe, expect, it, vi } from "vitest";
import { sanitizeDraft, syncOnboarding } from "@/lib/onboarding";

/** Fake mínimo de PrismaClient con lo que syncOnboarding necesita dentro de $transaction. */
function makeFakePrisma() {
  const personas = new Map<string, { clientId: string; name: string; tone: string; goals: string; allowedPhrases: string; forbiddenPhrases: string }>();
  const state = {
    clientUpdates: [] as any[],
    brandUpserts: [] as any[],
    personaCreates: [] as any[],
    onboardingUpdates: [] as any[],
    monitoredSourceUpserts: [] as any[],
  };
  const tx = {
    client: {
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
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    monitoredSource: {
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
});

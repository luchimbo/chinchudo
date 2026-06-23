import { describe, expect, it } from "vitest";
import { catalogRuleMatches, resolveOpportunityClient } from "../client-context";
import { detectCrossClientTerms, validateClientScopedActors } from "../guardrails";

const clients = [
  {
    id: "pcmidi",
    name: "PC MIDI Center",
    slug: "pcmidi",
    description: "",
    domainKeywords: JSON.stringify(["midiplus", "controlador midi", "daw"]),
    domainExclusions: JSON.stringify(["midi skirt"]),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "prestige",
    name: "Prestige Running",
    slug: "prestige-running",
    description: "",
    domainKeywords: JSON.stringify(["prestige running", "medias deportivas", "running", "compresion", "trail"]),
    domainExclusions: JSON.stringify(["media hora", "media cancha", "a medias"]),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function prismaMock() {
  return {
    monitoredSource: { findUnique: async () => null },
    brand: { findUnique: async () => null },
    client: { findMany: async () => clients },
  } as any;
}

describe("resolveOpportunityClient", () => {
  it("resuelve PC MIDI por keywords musicales", async () => {
    const r = await resolveOpportunityClient(prismaMock(), {
      sourceText: "Consulta sobre controlador MIDI para Ableton DAW",
      detectedBrandId: null,
      monitoredSourceId: null,
    });
    expect(r.client.slug).toBe("pcmidi");
    expect(r.confidence).toBe("high");
  });

  it("resuelve Prestige por running/medias", async () => {
    const r = await resolveOpportunityClient(prismaMock(), {
      sourceText: "Busco medias deportivas para running y trail",
      detectedBrandId: null,
      monitoredSourceId: null,
    });
    expect(r.client.slug).toBe("prestige-running");
    expect(r.confidence).toBe("high");
  });

  it("exclusiones evitan falso positivo de medias", async () => {
    const r = await resolveOpportunityClient(prismaMock(), {
      sourceText: "Tengo media hora para ver un controlador MIDI",
      detectedBrandId: null,
      monitoredSourceId: null,
    });
    expect(r.client.slug).toBe("pcmidi");
  });
});

describe("catalogRuleMatches", () => {
  it("matchea reglas de Prestige", () => {
    const matches = catalogRuleMatches("Tengo dudas con compresion para correr 10K", [
      { category: "running", keywords: JSON.stringify(["running", "correr", "10k"]) },
      { category: "compresion", keywords: JSON.stringify(["compresion", "15-20"]) },
    ]);
    expect(matches).toEqual(["running", "compresion"]);
  });
});

describe("guardrails", () => {
  it("bloquea persona fuera del cliente", () => {
    const result = validateClientScopedActors({
      client: clients[0] as any,
      brand: { id: "b1", name: "MidiPlus", clientId: "pcmidi" } as any,
      persona: { id: "p1", name: "El Corredor", clientId: "prestige" } as any,
    });
    expect(result.ok).toBe(false);
  });

  it("detecta terminos de otro cliente", async () => {
    const hits = await detectCrossClientTerms({
      client: {
        findMany: async () => [
          { ...clients[1], brands: [{ name: "Prestige Running" }] },
        ],
      },
    } as any, "pcmidi", "Recomendaria unas medias deportivas Prestige Running");
    expect(hits[0]).toContain("prestige-running");
  });
});

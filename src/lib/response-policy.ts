import type { Client } from "@prisma/client";

export type ResponsePolicy = {
  identity: "advisor" | "ambassador";
  inferenceMode: "literal" | "prudent";
  unsupportedClaimAction: "regenerate_and_block" | "warn";
  competitorMention: "when_helpful" | "purchase_only" | "never";
  competitorTone: "neutral" | "critical_colloquial";
};

const BASE_POLICY: ResponsePolicy = {
  identity: "advisor",
  inferenceMode: "prudent",
  unsupportedClaimAction: "regenerate_and_block",
  competitorMention: "when_helpful",
  competitorTone: "neutral",
};

const CLIENT_DEFAULTS: Record<string, Partial<ResponsePolicy>> = {
  pcmidi: { competitorTone: "critical_colloquial" },
  "prestige-running": { competitorMention: "never" },
  jurispedia: { inferenceMode: "literal", competitorMention: "never" },
  "programa-vidia": { inferenceMode: "literal", competitorMention: "never" },
};

export function resolveResponsePolicy(client?: (Pick<Client, "slug"> & { responsePolicy?: unknown }) | null): ResponsePolicy {
  const stored = client?.responsePolicy && typeof client.responsePolicy === "object" && !Array.isArray(client.responsePolicy)
    ? client.responsePolicy as Partial<ResponsePolicy>
    : {};
  return { ...BASE_POLICY, ...(client?.slug ? CLIENT_DEFAULTS[client.slug] : {}), ...stored };
}

export function policyInstructions(client?: (Pick<Client, "slug"> & { responsePolicy?: unknown }) | null) {
  const policy = resolveResponsePolicy(client);
  const inference = policy.inferenceMode === "prudent"
    ? "Podés traducir una especificación confirmada a un beneficio probable usando 'puede', 'suele' o 'conviene'."
    : "Limitate a hechos literales confirmados; no deduzcas beneficios nuevos.";
  const competitor = policy.competitorMention === "when_helpful" && client?.slug === "pcmidi"
    ? "En consultas generales de baterías electrónicas podés introducir Millenium cuando ayude a orientar una compra. Mantené un tono crítico y coloquial, sin inventar fallas, experiencias ni afirmar que la probaste salvo que exista evidencia de prueba del equipo."
    : "No introduzcas competidores si no fueron mencionados por la persona.";
  return { policy, text: `${inference} ${competitor}` };
}

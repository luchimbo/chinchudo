import type { CompetitorEvidence, PrismaClient } from "@prisma/client";

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function evidenceMatches(text: string, evidence: Pick<CompetitorEvidence, "competitorBrand" | "aliases" | "model" | "topic">) {
  const source = normalize(text);
  const aliases = Array.isArray(evidence.aliases) ? evidence.aliases.filter((value): value is string => typeof value === "string") : [];
  const terms = [evidence.competitorBrand, evidence.model, evidence.topic, ...aliases].filter(Boolean);
  return terms.some((term) => source.includes(normalize(term)));
}

export async function loadRelevantCompetitorEvidence(prisma: PrismaClient, clientId: string, sourceText: string) {
  const rows = await prisma.competitorEvidence.findMany({ where: { clientId, active: true }, orderBy: { updatedAt: "desc" } });
  return rows.filter((row) => evidenceMatches(sourceText, row)).slice(0, 3);
}

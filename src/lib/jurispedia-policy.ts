import type { Channel, Opportunity } from "@prisma/client";

export const JURISPEDIA_POLICY_VERSION = "2026-07-14";
export const JURISPEDIA_BASE_URL = "https://www.jurispedia.com.ar/";

export type JurispediaCategory =
  | "laboral"
  | "familia_alimentos"
  | "alquileres"
  | "danos_accidentes"
  | "consumo"
  | "salud"
  | "general";

export type JurispediaSafetyDecision = {
  allowed: boolean;
  category: JurispediaCategory;
  reason: string;
};

const BLOCKED_PATTERNS: Array<[RegExp, string]> = [
  [/\b(urgente|emergencia|peligro inmediato|ahora mismo)\b/i, "urgencia"],
  [/\b(violencia|golpe[oó]|amenaz[^\s,.!?]*|abus[oa]|violaci[oó]n|femicidio)\b/i, "violencia o abuso"],
  [/\b(detenci[oó]n|allanamiento|imputad[oa]|denuncia penal|causa penal|fiscal[ií]a|c[aá]rcel)\b/i, "asunto penal activo"],
  [/\b(menor(?:es)?|niñ[oa]s?|adolescente|hij[oa] menor)\b/i, "menor identificable o asunto sensible"],
  [/\b(dni|cuil|cuit|tel[eé]fono|whatsapp|domicilio|direcci[oó]n|mail|correo|patente)\b/i, "dato personal"],
];

const CATEGORY_PATTERNS: Array<[JurispediaCategory, RegExp]> = [
  ["laboral", /\b(despido|despidieron|despedid[oa]|trabajo|laboral|empleador|indemnizaci[oó]n laboral|sueldo|art)\b/i],
  ["familia_alimentos", /\b(alimento[s]?|cuota alimentaria|cuidado personal|divorcio|r[eé]gimen de visitas)\b/i],
  ["alquileres", /\b(alquiler|locador|locatario|desalojo|contrato de locaci[oó]n)\b/i],
  ["danos_accidentes", /\b(accidente|choque|siniestro|daño moral|daños y perjuicios|responsabilidad civil)\b/i],
  ["consumo", /\b(consumidor|defensa del consumidor|compra|garant[ií]a|tarjeta|banco|cobro indebido)\b/i],
  ["salud", /\b(mala praxis|obra social|prepaga|amparo de salud|tratamiento m[eé]dico)\b/i],
];

export function classifyJurispediaSafety(text: string): JurispediaSafetyDecision {
  const clean = text.replace(/\s+/g, " ").trim();
  const blocked = BLOCKED_PATTERNS.find(([pattern]) => pattern.test(clean));
  if (blocked) return { allowed: false, category: "general", reason: `Excluida por ${blocked[1]}.` };

  const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(clean))?.[0] ?? "general";
  const isQuestion = /[?¿]|\b(c[oó]mo|qu[eé]|cu[aá]nto|puedo|corresponde|busco|necesito|d[oó]nde)\b/i.test(clean);
  if (!isQuestion) return { allowed: false, category, reason: "No es una consulta jurídica concreta." };
  return { allowed: true, category, reason: `Consulta pública apta: ${category}.` };
}

export function isJurispediaAutoPublishAllowed(input: {
  clientSlug: string;
  opportunity: Pick<Opportunity, "sourceText">;
  channel: Pick<Channel, "name">;
  channelEnabled: boolean;
}) {
  if (input.clientSlug !== "jurispedia") return { allowed: true, reason: "No aplica política Jurispedia." };
  if (!input.channelEnabled) return { allowed: false, reason: `Publicación pausada para ${input.channel.name}.` };
  return classifyJurispediaSafety(input.opportunity.sourceText);
}

export function buildJurispediaCta(category: JurispediaCategory, channel: string, opportunityId: string) {
  const url = new URL(JURISPEDIA_BASE_URL);
  url.searchParams.set("utm_source", channel.toLowerCase());
  url.searchParams.set("utm_medium", "organic_reply");
  url.searchParams.set("utm_campaign", "jurispedia_organic_pilot");
  url.searchParams.set("utm_content", opportunityId);
  url.searchParams.set("utm_term", category);
  return url.toString();
}

export function makeJurispediaDrafts(input: { text: string; channel: string; opportunityId: string }) {
  const safety = classifyJurispediaSafety(input.text);
  if (!safety.allowed) return [];
  const cta = buildJurispediaCta(safety.category, input.channel, input.opportunityId);
  const disclosure = "Jurispedia es una herramienta de investigación jurídica, no asesoramiento legal.";
  return [
    { variantType: "SHORT" as const, draftText: `Podés buscar jurisprudencia argentina gratis en Jurispedia: ${cta}`, riskNotes: `${disclosure} Política ${JURISPEDIA_POLICY_VERSION}.` },
    { variantType: "TECHNICAL" as const, draftText: `Jurispedia permite buscar fallos de Argentina y filtrar por provincia, tribunal, sala o fecha. Incluye la fuente oficial de cada resultado: ${cta}`, riskNotes: `${disclosure} No agregar citas, montos ni conclusiones sobre el caso.` },
    { variantType: "CONVERSATIONAL" as const, draftText: `Jurispedia es gratis y sirve para buscar jurisprudencia argentina con la fuente oficial de cada fallo: ${cta}`, riskNotes: `${disclosure} No solicitar ni repetir datos personales.` },
  ];
}

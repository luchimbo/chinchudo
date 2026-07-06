import type { OpportunityIntent, OpportunityPriority } from "@prisma/client";

type TriageInput = {
  sourceText: string;
  sourceAuthor?: string | null;
  detectedIntent?: OpportunityIntent | string | null;
  priority?: OpportunityPriority | string | null;
  sourceUrl?: string | null;
};

export type TriageDecision = {
  action: "keep" | "discard";
  reason: string;
  score: number;
};

const COMMERCIAL_TERMS = [
  "comprar",
  "compro",
  "consigo",
  "donde",
  "precio",
  "cuanto",
  "cuesta",
  "stock",
  "garantia",
  "envio",
  "vale la pena",
  "conviene",
  "recomiendan",
  "recomendacion",
  "no funciona",
  "no reconoce",
  "detecta",
  "driver",
  "compatib",
  "latencia",
  "interfaz",
  "controlador midi",
  "teclado midi",
  "home studio",
  "bateria electronica",
  "piano digital",
  "midiplus",
  "kressmer",
];

const NOISE_TERMS = [
  "disponible para envio inmediato",
  "link en bio",
  "sigueme",
  "seguime",
  "giveaway",
  "sorteo",
  "vendido",
  "sold",
  "beat del dia",
  "puro humor",
  "like y comparte",
  "dejanos un like",
];

const IRRELEVANT_TERMS = [
  "sala de eventos",
  "estampado",
  "serigrafia",
  "viernes",
  "fiesta",
  "prision",
];

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hasAny(haystack: string, terms: string[]) {
  return terms.some((term) => haystack.includes(normalize(term)));
}

export function triageOpportunity(input: TriageInput): TriageDecision {
  const text = normalize(`${input.sourceText} ${input.sourceAuthor ?? ""}`);
  const words = text.split(/\s+/).filter(Boolean);
  let score = 0;
  const reasons: string[] = [];

  if (input.priority === "URGENT") score += 7;
  if (input.priority === "HIGH") score += 5;
  if (input.priority === "MEDIUM") score += 2;
  if (input.detectedIntent && input.detectedIntent !== "GENERAL_DISCUSSION") score += 3;

  if (hasAny(text, COMMERCIAL_TERMS)) {
    score += 4;
    reasons.push("tiene senales comerciales o tecnicas");
  }

  if (hasAny(text, NOISE_TERMS)) {
    score -= 5;
    reasons.push("parece publicacion promocional o ruido");
  }

  if (hasAny(text, IRRELEVANT_TERMS)) {
    score -= 8;
    reasons.push("contiene terminos fuera del nicho");
  }

  if (words.length < 4) {
    score -= 4;
    reasons.push("texto demasiado corto");
  }

  if (/^[\W_]+$/.test(text.trim())) {
    score -= 10;
    reasons.push("solo signos o emojis");
  }

  if (input.sourceUrl?.includes("instagram.com") && !hasAny(text, COMMERCIAL_TERMS) && words.length < 12) {
    score -= 2;
    reasons.push("instagram sin pregunta clara");
  }

  const action = score <= -3 ? "discard" : "keep";
  return {
    action,
    score,
    reason: reasons.length ? reasons.join("; ") : "sin senales fuertes de descarte",
  };
}


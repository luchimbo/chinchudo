import type { OpportunityIntent } from '@prisma/client';

type CopilotGoal = "RESPONDER" | "VENDER" | "CUIDAR";
type CopilotStyle = "NORMAL" | "CON_ONDA" | "CON_CUIDADO";

const COPILOT_SENSITIVE_TEXT = /\b(muert[oe]s?|falleci(?:o|ó|eron)|tragedia|accidente|violencia|crimen|asesin|abuso|denuncia|estafa|reclamo|queja|devoluci[oó]n|garant[ií]a|no funciona|fall[ao]|problema|verg[üu]enza|indign)/i;
const COPILOT_LIGHT_TEXT = /(?:\bjaja(?:ja)?\b|\blol\b|\bmeme\b|\bbanco\b|\bme encanta\b|\bamo\b|😂|🤣|😅|😎|🔥|✨)/i;

/** Safety-first editorial reading: serious topics never receive humour or a trend reference. */
export function deriveCopilotApproach(opportunity: { sourceText: string; detectedIntent: OpportunityIntent }): { goal: CopilotGoal; style: CopilotStyle } {
  const text = opportunity.sourceText;
  const sensitive = COPILOT_SENSITIVE_TEXT.test(text) || opportunity.detectedIntent === "WARRANTY_QUESTION";
  if (sensitive) return { goal: "CUIDAR", style: "CON_CUIDADO" };
  if (opportunity.detectedIntent === "PURCHASE_QUESTION" || opportunity.detectedIntent === "PRICE_QUESTION") {
    return { goal: "VENDER", style: "NORMAL" };
  }
  if (COPILOT_LIGHT_TEXT.test(text)) return { goal: "RESPONDER", style: "CON_ONDA" };
  return { goal: "RESPONDER", style: "NORMAL" };
}

export function pickCopilotPersona<T extends { name: string }>(
  personas: T[],
  goal: CopilotGoal,
  style: CopilotStyle,
) {
  const byName = (name: string) => personas.find((persona) => persona.name.toLowerCase() === name.toLowerCase());

  if (goal === "VENDER") return byName("Comercial") ?? personas[0];
  if (goal === "CUIDAR" || style === "CON_CUIDADO") return byName("Educativo") ?? personas[0];
  if (style === "CON_ONDA") return byName("Innovación") ?? byName("Innovacion") ?? personas[0];
  return byName("Técnico") ?? byName("Tecnico") ?? byName("Práctico") ?? byName("Practico") ?? personas[0];
}

export function copilotGuidance(contextAssessment: unknown, pulse?: { title: string } | null) {
  const context = contextAssessment && typeof contextAssessment === "object"
    ? contextAssessment as Record<string, unknown>
    : {};
  const copilot = context.copilot && typeof context.copilot === "object"
    ? context.copilot as Record<string, unknown>
    : {};
  const objective = copilot.goal === "VENDER"
    ? "Objetivo: orientar hacia un producto o asesoramiento de forma natural, sin presionar ni inventar condiciones comerciales."
    : copilot.goal === "CUIDAR"
      ? "Objetivo: priorizar empatia, claridad y contencion. No uses humor ni referencias de actualidad."
      : "Objetivo: responder de forma util y concreta antes que vender.";
  const voice = copilot.style === "CON_ONDA"
    ? "Estilo: con onda. Podes usar un remate liviano o lenguaje cercano, pero no fuerces memes, sarcasmo ni una referencia que el comentario no pide."
    : copilot.style === "CON_CUIDADO"
      ? "Estilo: con cuidado. Evita remates, ironias y referencias culturales."
      : "Estilo: normal. Claro, cercano y sin buscar un chiste.";
  const pulseNote = copilot.style === "CON_ONDA" && pulse
    ? `Pulso opcional: "${pulse.title}". Solo podes tomarlo como guino si encaja de forma natural con el comentario; si no encaja, ignoralo por completo.`
    : "";
  return [objective, voice, pulseNote].filter(Boolean).join("\n");
}


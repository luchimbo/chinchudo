import type { Persona } from "@prisma/client";
import { prisma } from "./db";

// Reglas de español argentino compartidas por guiones e ideas de video.
// Misma línea que ai-draft-generator.ts, adaptada a texto hablado.
export const ARGENTINE_SPANISH_RULES = `### ESPAÑOL ARGENTINO (obligatorio)
- Escribí como habla la gente en Buenos Aires, siempre con voseo: tenés, podés, querés, mirá, probá, fijate, imaginate, escribinos.
- Nunca tuteo ni español neutro: nada de tienes, puedes, quieres, imagínate, escríbenos, tú, para ti, contigo.
- Plural siempre con "ustedes", nunca "vosotros".
- Léxico local cuando encaje: celu, compu, plata, auriculares, depto. Nunca ordenador, móvil, vale, guay, chévere ni carro.
- Muletillas rioplatenses (che, posta, igual) con moderación: como máximo una por guion.
- Frases cortas, como se dicen en voz alta, con tildes correctas.`;

export const SCRIPT_SYSTEM_MESSAGE = "Sos guionista de videos cortos en Argentina. Escribís como habla la gente en Buenos Aires, con voseo. Devolvés solamente JSON válido.";

const MAX_EXAMPLE_CHARS = 400;

function clip(text: string, max = MAX_EXAMPLE_CHARS) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Ejemplos de registro para imitar: los de la persona (editables en /personas)
 * y los últimos guiones que el equipo aprobó para esa persona.
 */
export async function voiceExamplesBlock(persona: Pick<Persona, "id" | "clientId" | "goodExamples" | "badExamples">, { limit = 3, compact = false } = {}): Promise<string> {
  const approved = await prisma.videoScript.findMany({
    where: { personaId: persona.id, clientId: persona.clientId, status: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { hook: true, bodyText: true, cta: true },
  });
  const parts: string[] = [];
  if (persona.goodExamples?.trim()) parts.push(`Así sí habla esta persona:\n${clip(persona.goodExamples, compact ? 300 : 800)}`);
  if (persona.badExamples?.trim()) parts.push(`Así NO:\n${clip(persona.badExamples, compact ? 200 : 500)}`);
  if (approved.length) {
    parts.push(`Guiones aprobados por el equipo para esta persona:\n${approved.map((script) => `- ${clip(compact ? script.hook : `${script.hook} ${script.bodyText} ${script.cta}`, compact ? 160 : MAX_EXAMPLE_CHARS)}`).join("\n")}`);
  }
  return parts.length ? `### EJEMPLOS DE REGISTRO (imitá registro, ritmo y largo; no copies frases)\n${parts.join("\n\n")}` : "";
}

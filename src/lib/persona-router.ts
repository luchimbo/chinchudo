import type { Opportunity, Product } from "@prisma/client";
import { matchCategories } from "./catalog";

// Nombres exactos del quinteto en la base (deben coincidir con prisma/seed.ts).
export const PERSONA_NAMES = {
  TECNICO: "Técnico / Productor",
  BATERISTA: "Baterista de Departamento",
  TRENDSETTER: "Trend-Setter Kressmer",
  PROFE: "Profe / Madre-Padre",
  CAZADOR: "Cazador de Ofertas",
} as const;

// Set canonico para validar que el router nunca sugiera una persona inexistente.
export const PERSONA_NAME_SET: ReadonlySet<string> = new Set(Object.values(PERSONA_NAMES));

export type PersonaSuggestion = {
  personaName: string;
  score: number;
  reason: string;
};

type Rule = {
  persona: string;
  weight: number;
  test: (signals: Signals) => boolean;
  reason: string;
};

type Signals = {
  text: string; // lowercase
  intent: string;
  categories: string[]; // categoria_id de productos relevantes del catálogo
};

const RULES: Rule[] = [
  // --- Cazador de Ofertas: precio, cuotas, financiación, disponibilidad ---
  {
    persona: PERSONA_NAMES.CAZADOR,
    weight: 5,
    test: (s) => /cuota|cuotas|financiaci[oó]n|sin inter[eé]s|precio|cu[aá]nto sale|cu[aá]nto cuesta|oferta|descuento|promo|barat|presupuesto|stock|disponib/.test(s.text),
    reason: "consulta de precio/cuotas/oferta/disponibilidad",
  },

  // --- Técnico / Productor: garantía, soporte, MIDI/DAW, home studio, producción ---
  {
    persona: PERSONA_NAMES.TECNICO,
    weight: 5,
    test: (s) => s.intent === "WARRANTY_QUESTION",
    reason: "consulta de garantía/posventa",
  },
  {
    persona: PERSONA_NAMES.TECNICO,
    weight: 3,
    test: (s) => /garant[ií]a|posventa|post.?venta|servicio t[eé]cnico|devoluci[oó]n|se rompi[oó]|fall[oa]|defecto|reclamo|driver|compatib|configur/.test(s.text),
    reason: "menciona garantía/servicio/compatibilidad/drivers",
  },
  {
    persona: PERSONA_NAMES.TECNICO,
    weight: 4,
    test: (s) => /daw|ableton|fl studio|fl ?studio|logic|reaper|cubase|home studio|producci[oó]n|producir|grabar|grabaci[oó]n|mezcla|beat|vst|plugin/.test(s.text),
    reason: "contexto de producción/DAW/home studio",
  },
  {
    persona: PERSONA_NAMES.TECNICO,
    weight: 3,
    test: (s) => s.categories.includes("controladores-midi") ||
      s.categories.includes("controladores-pads") ||
      s.categories.includes("interfaces-audio") ||
      s.categories.includes("sintes-analogicos-hibridos"),
    reason: "producto de producción (MIDI/interfaz/sinte)",
  },
  {
    persona: PERSONA_NAMES.TECNICO,
    weight: 3,
    test: (s) => s.intent === "TECHNICAL_QUESTION",
    reason: "pregunta técnica de configuración",
  },

  // --- Baterista de Departamento: ruido, vecinos, espacio, parches, feeling ---
  {
    persona: PERSONA_NAMES.BATERISTA,
    weight: 5,
    test: (s) => s.categories.includes("baterias-electronicas") &&
      /vecino|ruido|silencio|depto|departamento|edificio|molest|noche|auricular|de noche|parche|malla|rebote|feeling/.test(s.text),
    reason: "batería electrónica + ruido/espacio/parches/feeling",
  },
  {
    persona: PERSONA_NAMES.BATERISTA,
    weight: 3,
    test: (s) => s.categories.includes("baterias-electronicas"),
    reason: "comentario sobre batería electrónica",
  },
  {
    persona: PERSONA_NAMES.BATERISTA,
    weight: 2,
    test: (s) => /vecino|silencio|sin ruido|departamento|edificio|molestar/.test(s.text),
    reason: "menciona ruido/vecinos/espacio reducido",
  },

  // --- Trend-Setter Kressmer: novedad, lanzamiento, diseño, marca Kressmer ---
  {
    persona: PERSONA_NAMES.TRENDSETTER,
    weight: 5,
    test: (s) => /kressmer/.test(s.text),
    reason: "menciona Kressmer",
  },
  {
    persona: PERSONA_NAMES.TRENDSETTER,
    weight: 3,
    test: (s) => /novedad|lanzamiento|nuevo modelo|reci[eé]n sali[oó]|dise[ñn]o|premium|tendencia|la rompe|est[eé]tica|aesthetic/.test(s.text),
    reason: "novedad/lanzamiento/diseño",
  },

  // --- Profe / Madre-Padre: aprendizaje, alumnos, principiantes, durabilidad ---
  {
    persona: PERSONA_NAMES.PROFE,
    weight: 4,
    test: (s) => /alumno|profe|profesor|clase|ense[ñn]ar|aprend|principiante|empezar|para mi hijo|para mi hija|escuela|conservatorio|reci[eé]n empiezo|de cero/.test(s.text),
    reason: "contexto de aprendizaje/principiante/clases",
  },
  {
    persona: PERSONA_NAMES.PROFE,
    weight: 2,
    test: (s) => /durable|durabilidad|que dure|resistente|para toda la vida|inversi[oó]n/.test(s.text),
    reason: "prioriza durabilidad",
  },
];

// Ángulos fijos por voz: razón que explica qué aporte hace cada persona
// independientemente del contexto (se usa en modo multi-persona).
const PERSONA_ANGLES: Record<string, string> = {
  [PERSONA_NAMES.TECNICO]:    "responde desde la experiencia técnica (setup, drivers, DAW, compatibilidad)",
  [PERSONA_NAMES.CAZADOR]:    "aporta info de precio, cuotas, disponibilidad y relación precio-calidad",
  [PERSONA_NAMES.BATERISTA]:  "comenta desde el uso en departamento (ruido, auriculares, espacio reducido)",
  [PERSONA_NAMES.TRENDSETTER]:"presenta el ángulo de diseño, novedad y marca Kressmer",
  [PERSONA_NAMES.PROFE]:      "habla desde la enseñanza y la experiencia con alumnos principiantes",
};

export function suggestPersona(
  opportunity: Pick<Opportunity, "sourceText" | "detectedIntent"> & { detectedProduct?: Product | null },
): PersonaSuggestion {
  return suggestAllPersonas(opportunity)[0];
}

/**
 * Devuelve las 5 personas con su ángulo propio.
 * La primera es la mejor coincidencia según reglas; el resto sigue en orden de score.
 * Todas reciben un `reason` con su ángulo específico para que el generador de borradores
 * pueda darle una perspectiva distinta a cada voz.
 */
export function suggestAllPersonas(
  opportunity: Pick<Opportunity, "sourceText" | "detectedIntent"> & { detectedProduct?: Product | null },
): PersonaSuggestion[] {
  const text = (opportunity.sourceText || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const categories = matchCategories(opportunity.sourceText, opportunity.detectedProduct ?? null);
  const signals: Signals = { text, intent: opportunity.detectedIntent, categories };

  const scores = new Map<string, { score: number; reasons: string[] }>();
  for (const rule of RULES) {
    if (rule.test(signals)) {
      const cur = scores.get(rule.persona) ?? { score: 0, reasons: [] };
      cur.score += rule.weight;
      cur.reasons.push(rule.reason);
      scores.set(rule.persona, cur);
    }
  }

  // Todas las personas participan; el score determina el orden (mayor relevancia primero).
  return Object.values(PERSONA_NAMES).map((name) => {
    const entry = scores.get(name);
    const contextReason = entry ? entry.reasons.join("; ") : "";
    const angle = PERSONA_ANGLES[name] ?? "";
    return {
      personaName: name,
      score: entry?.score ?? 0,
      reason: contextReason ? `${contextReason} | ${angle}` : angle,
    };
  }).sort((a, b) => b.score - a.score);
}

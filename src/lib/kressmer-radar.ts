/** Rules shared by ingestion, daily quota and response generation. No catalog claims. */
export const KRESSMER_LANGUAGES = ["es", "en", "de"] as const;
export type KressmerLanguage = typeof KRESSMER_LANGUAGES[number];
// The first nine keep their order: MonitoredSource labels ("Kressmer YouTube ES 1") are index-based.
const BASE_QUERIES = [
  { language: "es", query: "piano digital para principiantes" },
  { language: "en", query: "digital piano buying advice" },
  { language: "de", query: "Digitalpiano für Anfänger" },
  { language: "es", query: "teclado musical aprender piano auriculares" },
  { language: "en", query: "musical keyboard weighted keys pedals" },
  { language: "de", query: "Keyboard Klavier lernen Kopfhörer" },
  { language: "es", query: "piano digital comparativa 88 teclas pedal" },
  { language: "en", query: "beginner piano keyboard home practice comparison" },
  { language: "de", query: "Digitalpiano Kaufberatung 88 Tasten Pedal" },
] as const;
// Searching for popular models finds the buyers asking questions; drafts still never name or rate them.
const MORE_QUERIES = {
  es: ["qué piano digital comprar", "teclado para aprender piano desde cero", "piano digital barato recomendaciones", "mejor piano digital calidad precio", "teclado de 61 teclas o piano de 88", "piano digital con teclas contrapesadas", "Yamaha P-145 opiniones", "Casio CDP-S110 review español", "Roland FP-30X review español", "teclado Yamaha PSR-E383 review", "Casio CT-S1 opiniones", "aprender piano con teclado en casa", "piano digital para niños", "piano digital vs piano acústico", "cómo elegir un teclado musical"],
  en: ["best digital piano under 500", "Yamaha P-145 review", "Roland FP-30X review", "Casio PX-S1100 review", "Kawai ES120 review", "Alesis Recital Pro review", "Donner DEP-20 review", "61 keys vs 88 keys beginner", "weighted vs semi weighted keys", "best keyboard for learning piano", "Casio CT-S1 review", "Yamaha PSR-E383 review", "digital piano for kids", "learn piano at home keyboard", "budget digital piano 2026"],
  de: ["Digitalpiano Test 2026", "bestes Digitalpiano für Einsteiger", "E-Piano kaufen Tipps", "Yamaha P-145 Test", "Roland FP-30X Test deutsch", "Casio PX-S1100 Test", "Kawai ES120 Test", "Thomann SP-320 Test", "Keyboard oder Digitalpiano Anfänger", "gewichtete Tastatur Digitalpiano", "Keyboard für Kinder lernen", "Klavier lernen zu Hause E-Piano", "günstiges Digitalpiano Empfehlung", "Stagepiano oder Digitalpiano", "Digitalpiano Kopfhörer üben"],
} as const;
export const KRESSMER_QUERIES: readonly { language: KressmerLanguage; query: string }[] = [
  ...BASE_QUERIES,
  ...MORE_QUERIES.es.flatMap((_, i) => KRESSMER_LANGUAGES.map(language => ({ language, query: MORE_QUERIES[language][i] }))),
];
/** Videos read per search. */
export const KRESSMER_VIDEOS_PER_QUERY = 6;
/** Search filter per full pass over the queries, best yield first (see agents/extractors/youtube.py). */
export const KRESSMER_SEARCH_MODES = ["popular", "any", "recent_month"] as const;
export function kressmerSearchMode(cursor: number) {
  return KRESSMER_SEARCH_MODES[Math.floor(cursor / KRESSMER_QUERIES.length) % KRESSMER_SEARCH_MODES.length];
}
/** After the three filters, the next passes read the following blocks of six videos. */
export function kressmerVideoOffset(cursor: number) {
  return (Math.floor(cursor / (KRESSMER_QUERIES.length * KRESSMER_SEARCH_MODES.length)) % 3) * KRESSMER_VIDEOS_PER_QUERY;
}
/** Pre-filter terms (word-bounded in social-listen): plurals and compounds the final check accepts by substring. */
export const KRESSMER_DOMAIN_KEYWORDS = ["kressmer", "piano", "pianos", "digitalpiano", "digitalpianos", "e-piano", "stagepiano", "klavier", "klaviere", "keyboard", "keyboards", "teclado", "teclados", "teclado musical", "teclado digital", "teclado electronico"];

const words = {
  es: "el la los las un una que qué cuál cómo para comprar necesito quiero tengo puedo con este esta teclas aprender recomiendan precio gracias",
  en: "the a an which what how for buy buying need want have can with this keys learn recommend price thanks does should would is are",
  de: "der die das ein eine welches welche wie für kaufen brauche möchte habe kann mit dieser dieses tasten lernen empfehlen preis danke ist sind ich und oder klavier anfänger",
};
export function detectKressmerLanguage(text: string): KressmerLanguage | "other" {
  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (tokens.some(token => ["qual", "você", "vocês", "não", "preciso", "obrigado", "obrigada"].includes(token))) return "other";
  const scores = KRESSMER_LANGUAGES.map(language => ({ language, score: tokens.filter(token => words[language].split(" ").includes(token)).length }))
    .sort((a, b) => b.score - a.score);
  return scores[0].score >= 2 && scores[0].score > scores[1].score ? scores[0].language : "other";
}

const INSTRUMENT = "(?:teclado|piano|modelo|equipo|instrumento|opcion|eleccion|keyboard|model|instrument|option|choice|board|unit|one|klavier|digitalpiano|e-piano|modell|gerat)";
const VERDICT = "(?:buen[oa]?|mal[oa]?|popular|limitad[oa]|solid[oa]|ideal|perfect[oa]|recomendable|basic[oa]|excelente|decente|economic[oa]|liviano|good|great|solid|decent|limited|fine|perfect|excellent|nice|basic|cheap|reliable|recommended|okay|ok|gut|beliebt|solide|begrenzt|perfekt|prima|toll|super)";
const CLAUSE = "(?:^|,\\s*|\\b(?:pero|y|aunque|igual|but|and|although|though|aber|und|obwohl|jedoch)\\s+)";
/** Without a catalog any sentence that describes or rates one concrete instrument is invented, even if it never names it. */
const IMPLICIT_ATTRIBUTION = [
  // Pro-drop / pronoun subject: "Es un teclado popular", "Tiene 61 teclas", "It's great for beginners", "Es ist ein gutes Keyboard".
  new RegExp(`${CLAUSE}(?:es|it'?s|it is|es ist) (?:un|una|a|an|ein|eine|einen) (?:[a-z]+ ){0,2}${INSTRUMENT}\\b`),
  new RegExp(`${CLAUSE}(?:es|it'?s|it is|es ist) (?:muy |bastante |re |super |very |really |pretty |quite |sehr |ziemlich )?${VERDICT}\\b(?!,|\\s+(?:que|to|that|if|when|zu|dass|wenn)\\b|\\s+(?!para\\b)[a-z]+(?:ar|er|ir)(?:lo|la|los|las)?\\b)`),
  new RegExp(`${CLAUSE}(?:no )?(?:tiene(?! sentido)|trae|viene|cuenta con|incluye|ofrece|suena|anda|funciona|le falta|carece|suele (?:ser|tener|traer|venir|sonar))\\b`),
  new RegExp(`${CLAUSE}(?:it|es) (?:only |just |also |nur |auch )?(?:has|comes|offers|features|includes|sounds|lacks|feels|plays|doesn'?t|does not|hat|bietet|verfugt|kommt|klingt|fehlt)\\b`),
  /\bal (?:ser|tener|traer|venir|contar)\b|\b(?:since|because|as) it\b|\b(?:da|weil) es\b/,
  /\b(?:its|sus?|seine?n?|ihre?n?) (?:teclas|sonido|parlantes|altavoces|pedal|mecanica|polifonia|keys|sound|speakers|action|polyphony|tasten|klang|lautsprecher|tastatur)\b/,
  new RegExp(`\\b(?:este|ese|aquel|dicho|tu|su|this|that|your|dieses|dieser|das|dein|ihr) ${INSTRUMENT}\\b(?: [a-z]+)? (?:es|tiene|trae|viene|suena|ofrece|incluye|cuenta|no|anda|funciona|va|is|'s|has|comes|offers|features|includes|sounds|lacks|feels|doesn'?t|won'?t|ist|hat|bietet|klingt|kommt|verfugt|eignet)\\b`),
];
const THIRD_PARTY_BRANDS = /\b(?:yamaha|casio|roland|korg|kawai|alesis|donner|kurzweil|nord|medeli|artesia|williams|thomann|startone|behringer|arturia|novation|m-audio|akai|nektar|ketron|bontempi|midiplus|kurtzman|orla|ringway)\b/;

export type KressmerCatalogEntry = { name: string; description?: string | null; technicalSpecs?: string | null };

function normalizeClaimText(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’`´]/g, "'");
}

/** "Kressmer K-180 Piano Digital…" -> "k180"; "Piano Digital Modular Kressmer 3008…" -> "3008". */
export function kressmerModelCode(name: string): string | null {
  const match = normalizeClaimText(name).match(/kressmer\s+([a-z]{0,3}-?\d{2,4})\b/);
  return match ? match[1].replace(/[^a-z0-9]/g, "") : null;
}

function modelCodePattern(code: string, flags = "") {
  const [, letters, digits] = code.match(/^([a-z]*)(\d+)$/) || [];
  return new RegExp(`\\b${letters}${letters ? "[- ]?" : ""}${digits}\\b`, flags);
}

/** What a reply may rely on: the description and confirmed spec lines. The sheets'
 * "Precisiones", "Reglas de respuesta" and "Opcionales" lines list what must NOT be
 * claimed (e.g. "No declarar acción martillo"), so they are never evidence. */
function catalogEvidence(entry: KressmerCatalogEntry) {
  const specs = (entry.technicalSpecs || "").split("\n")
    .filter(line => !/^\s*(?:precisiones|reglas de respuesta|opcionales)\b/.test(normalizeClaimText(line))).join(" ");
  return normalizeClaimText(`${entry.description || ""} ${specs}`);
}

// [claim in the reply (es/en/de), evidence required in the sheet (sheets are in Spanish)]
const FEATURE_CLAIMS: [RegExp, RegExp][] = [
  [/\b(?:martillo|hammer\w*)\b/, /martillo|hammer/],
  [/\b(?:contrapesad\w*|pesad[oa]s?|weighted|gewichtet\w*)\b/, /contrapes|pesad|weighted|gewichtet|martillo|hammer/],
  [/\bbluetooth\b/, /bluetooth/],
  [/\b(?:mueble|cabinet|gehause|mobel\w*)\b/, /mueble|cabinet|gehause|mobel/],
  [/\busb\b/, /\busb\b/],
  [/\b(?:baterias?|battery|batteries|akku\w*)\b/, /bateria|battery|akku/],
  [/\b(?:polifonia|polyphon\w*)\b/, /polifonia|polyphon/],
  [/\b(?:parlantes?|altavoces|altavoz|speakers?|lautsprecher)\b/, /parlante|altavo|speaker|lautsprecher/],
  [/\b(?:auriculares?|headphones?|kopfhorer\w*)\b/, /auricular|headphone|kopfhorer/],
  [/\bmidi\b/, /\bmidi\b/],
  [/\b(?:grabacion|grabar|record\w*|aufnahme\w*)\b/, /grabacion|grabar|record|aufnahme/],
  [/\b(?:metronomo|metronome|metronom)\b/, /metronom/],
  [/\b(?:apps?|aplicacion\w*)\b/, /\bapps?\b|aplicacion/],
  [/\b(?:modular|portable|portatil|tragbar\w*|transportable)\b/, /modular|portable|portatil|tragbar|traslado|transport/],
  [/\b(?:pedales|pedals|pedale|pedal triple|triple pedal)\b/, /pedales|pedal triple|triple pedal|sistema de pedales/],
  [/\b(?:microfono|microphone|mikrofon)\b/, /microfono|microphone|mikrofon/],
  [/\b(?:sensibles?|sensitiv\w*|velocity|anschlagdynam\w*)\b/, /sensib|sensitiv|velocidad|velocity/],
];

/** A sentence about Kressmer may only state features and numbers its sheet confirms. Without
 * a named model, a brand-level statement must hold for every catalogued model. */
function kressmerSpecErrors(sentence: string, catalog: { code: string | null; evidence: string }[]) {
  const named = catalog.filter(entry => entry.code && modelCodePattern(entry.code).test(sentence));
  const evidences = (named.length ? named : catalog).map(entry => entry.evidence);
  const confirmed = (pattern: RegExp) => named.length ? evidences.some(evidence => pattern.test(evidence)) : evidences.every(evidence => pattern.test(evidence));
  const errors: string[] = [];
  if (FEATURE_CLAIMS.some(([claim, evidence]) => claim.test(sentence) && !confirmed(evidence))) errors.push("unverified_kressmer_spec");
  let withoutCodes = sentence;
  for (const entry of named) withoutCodes = withoutCodes.replace(modelCodePattern(entry.code!, "g"), " ");
  const numbers = withoutCodes.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  if (numbers.some(number => !confirmed(new RegExp(`\\b${number.replace(/[.,]/, "[.,]")}\\b`)))) errors.push("unverified_kressmer_spec");
  return errors;
}

/**
 * Every reply has to recommend Kressmer: that is the point of the radar. Claims about a
 * Kressmer model must come from its catalogue sheet; anything said about another brand
 * or about the instrument the user asked about is never verified, so it blocks.
 */
export function kressmerDraftClaimErrors(text: string, catalogEntries: KressmerCatalogEntry[]): string[] {
  const normalized = normalizeClaimText(text);
  const catalog = catalogEntries.map(entry => ({ code: kressmerModelCode(entry.name), evidence: catalogEvidence(entry) }));
  const codes = catalog.flatMap(entry => entry.code ? [entry.code] : []);
  const errors: string[] = [];
  const sentences = normalized.split(/[.!?;:\n]+/).map(sentence => sentence.trim()).filter(Boolean);
  const aboutKressmer = (sentence: string) => /\bkressmer\b/.test(sentence) || codes.some(code => modelCodePattern(code).test(sentence));
  if (!/\bkressmer\b/.test(normalized)) errors.push("missing_kressmer_recommendation");
  // A competitor's specs are never covered by the Kressmer catalog, so naming one always blocks.
  if (sentences.some(sentence => THIRD_PARTY_BRANDS.test(sentence))) errors.push("unverified_third_party_product");
  // Sentences that are not about Kressmer can only be general guidance, never a description of the consulted instrument.
  if (sentences.some(sentence => !aboutKressmer(sentence) && IMPLICIT_ATTRIBUTION.some(pattern => pattern.test(sentence)))) errors.push("unverified_implicit_attribute");
  if (/\b(?:stock disponible|entrega inmediata|in stock|available now|sofort lieferbar|auf lager|garantia de|warranty of|jahre garantie)\b/.test(normalized)
    || /[$€£]|\b\d+[.,]?\d*\s*(usd|eur|ars)\b/.test(normalized)) errors.push("unverified_commercial_claim");
  if (!catalog.length && /\bkressmer\b[^.!?]*(?:\d|\b(?:tiene|trae|ofrece|has|offers|features|hat|bietet|verfugt)\b)/.test(normalized)) errors.push("unverified_kressmer_attribute");
  const modelCodes = normalized.match(/\b[a-z]{1,6}-?[a-z]?\d{2,4}[a-z]?\b/g) || [];
  if (modelCodes.some(token => !codes.includes(token.replace(/[^a-z0-9]/g, "")))) errors.push("uncatalogued_model_recommendation");
  if (catalog.length) errors.push(...sentences.filter(aboutKressmer).flatMap(sentence => kressmerSpecErrors(sentence, catalog)));
  if (/\b(?:yo (?:uso|probe)|i (?:use|tested|own)|ich (?:benutze|besitze|habe getestet))\b/.test(normalized)) errors.push("unverified_personal_experience");
  return [...new Set(errors)];
}

export function youtubeCommentIdentity(raw: string): { url: string; key: string; video: string } | null {
  try {
    const url = new URL(raw);
    if (!/^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(url.hostname)) return null;
    const video = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|live)\/([^/]+)/)?.[1];
    const comment = url.searchParams.get("lc") || url.hash.match(/^#comment-(.+)$/)?.[1];
    if (!video || !comment || !/^[\w-]+$/.test(comment) || /^\d+$/.test(comment)) return null;
    return { url: `https://www.youtube.com/watch?v=${encodeURIComponent(video)}&lc=${encodeURIComponent(comment)}`, key: `${video}:${comment}`, video };
  } catch { return null; }
}

/** Relative dates use the capture instant, so replaying intake cannot make them younger. */
export function commentPublishedAt(value: string, capturedAt: string | Date): Date | null {
  const captured = new Date(capturedAt);
  if (!Number.isFinite(captured.getTime())) return null;
  const text = value.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const relative = text.match(/(?:hace\s+|vor\s+)?(\d+|a|an|un|una|einer?|einem)\s*(seconds?|segundos?|sekunden?|minutes?|minutos?|minuten?|hours?|horas?|stunden?|days?|días?|dias?|tage?n?|weeks?|semanas?|wochen?|months?|mes(?:es)?|monate?n?|years?|años?|jahre?n?)/);
  if (relative) {
    const count = /^\d+$/.test(relative[1]) ? Number(relative[1]) : 1;
    const unit = relative[2];
    const seconds = /^(second|segundo|sekund)/.test(unit) ? 1 : /^(minute|minuto|minut)/.test(unit) ? 60 : /^(hour|hora|stund)/.test(unit) ? 3600 : /^(day|día|dia|tag)/.test(unit) ? 86400 : /^(week|semana|woch)/.test(unit) ? 604800 : /^(month|mes|monat)/.test(unit) ? 2678400 : 31622400;
    return new Date(captured.getTime() - count * seconds * 1000);
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Comments up to one year old count (was 30 days). A relative "1 year ago" can mean up to 23 months, so it stays out. */
export const KRESSMER_MAX_AGE_DAYS = 365;
const KRESSMER_MAX_AGE_MS = KRESSMER_MAX_AGE_DAYS * 86400000;

export function kressmerCommentReason(row: { channel: string; sourceType?: string; sourceUrl: string; sourceText: string; sourceTitle?: string; videoTitle?: string; publishedTime?: string; captured_at_utc?: string }, now = new Date()): string | null {
  if (String(row.channel || "").toLowerCase() !== "youtube" || row.sourceType !== "youtube_comment" || !youtubeCommentIdentity(row.sourceUrl)) return "not_identifiable_youtube_comment";
  const published = commentPublishedAt(row.publishedTime || "", row.captured_at_utc || "");
  if (!published || published > now || now.getTime() - published.getTime() > KRESSMER_MAX_AGE_MS) return "unknown_or_old_date";
  return kressmerTextReason(row.sourceText, `${row.sourceTitle || ""} ${row.videoTitle || ""}`);
}

/** A question, a request for help, or buying/choosing intent (budget, who it is for, worth it, which one). Praise or opinions do not count. */
const KRESSMER_NEED = new RegExp([
  "[?¿]",
  "\\b(?:necesito|busco|recomiend\\w*|recomendas|quiero|duda|problema|conviene|vale la pena|me sirve|sirve para|presupuesto|comprar\\w*|alguien sabe|que opinan|cual (?:me|es mejor|compro|elijo)|para mi (?:hij[oa]|nen[ea]|sobrin[oa]|espos[oa]|novi[oa])|principiante|empezar a (?:tocar|aprender))\\b",
  "\\b(?:need|looking for|recommend\\w*|should i|problem|help|worth it|is it worth|budget|afford|buy|buying|purchase|which one|anyone know|thinking (?:of|about) (?:getting|buying)|planning to (?:get|buy)|for my (?:son|daughter|kid|kids|child|wife|husband|girlfriend|boyfriend)|beginner|want to (?:learn|start))\\b",
  "\\b(?:brauche|suche|empfehl\\w*|problem|hilfe|mochte|lohnt|budget|kaufen|anfanger\\w*|welche[sn]?|uberlege|weiss jemand|fur mein(?:e|en)? (?:sohn|tochter|kind|frau|mann))\\b",
].join("|"), "i");

export function kressmerTextReason(text: string, title = ""): string | null {
  const context = `${text} ${title}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/computer keyboard|gaming keyboard|mechanical keyboard|teclado mecanico|teclado gamer|computertastatur|gaming.tastatur|giveaway|sorteo|link in bio|suscrib|subscribe to|abonnier|vendo |for sale|zu verkaufen/.test(context)) return "spam_or_unrelated";
  if (!/piano|klavier|keyboard|teclado musical|teclado digital|teclado electronico|kressmer/.test(context)) return "outside_pianos_and_keyboards";
  if (detectKressmerLanguage(text) === "other") return "unsupported_or_ambiguous_language";
  if (!KRESSMER_NEED.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return "no_concrete_need";
  return null;
}

export function argentinaDayStart(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 3600000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
}

export async function kressmerDailyProgress(db: Pick<import("@prisma/client").PrismaClient, "opportunity">, clientId: string, since = argentinaDayStart(), now = new Date()) {
  const rows = await db.opportunity.findMany({
    where: { clientId, createdAt: { gte: since }, status: { not: "DISCARDED" }, channel: { name: { equals: "YouTube", mode: "insensitive" } } },
    select: { id: true, contextAssessment: true, responses: { select: { draftText: true, editedText: true } } },
  });
  const valid = rows.filter(row => {
    const meta = (row.contextAssessment as { kressmerRadar?: { version: number; language: string; publishedAt: string; commentKey: string } })?.kressmerRadar;
    const published = new Date(meta?.publishedAt || "").getTime();
    return meta?.version === 1 && Boolean(meta.commentKey) && KRESSMER_LANGUAGES.includes(meta.language as KressmerLanguage)
      && Number.isFinite(published) && published <= now.getTime() && now.getTime() - published <= KRESSMER_MAX_AGE_MS;
  });
  const ready = valid.filter(row => {
    const language = (row.contextAssessment as { kressmerRadar: { language: string } }).kressmerRadar.language;
    return row.responses.some(response => detectKressmerLanguage(response.editedText || response.draftText) === language);
  });
  return { opportunities: valid.length, ready: ready.length, pendingIds: valid.filter(row => !ready.includes(row)).map(row => row.id) };
}

const CORRECTIONS: Record<string, string> = {
  missing_kressmer_recommendation: "Recomendá un piano digital Kressmer concreto del catálogo, nombrándolo «Kressmer <modelo>».",
  unverified_kressmer_spec: "Del modelo Kressmer usá solo datos de su ficha; quitá cualquier característica o número que la ficha no confirme.",
  uncatalogued_model_recommendation: "Nombrá solo modelos Kressmer del catálogo, con su código exacto.",
  unverified_third_party_product: "No nombres otras marcas ni modelos, tampoco el que mencionó el usuario.",
  unverified_implicit_attribute: "No describas ni califiques el instrumento que consultó el usuario; dale criterios y presentá el Kressmer.",
  unverified_commercial_claim: "Quitá precio, stock, garantía y disponibilidad.",
  unverified_kressmer_attribute: "No le atribuyas características a Kressmer sin ficha.",
  unverified_personal_experience: "Sin experiencias personales: hablás como la cuenta oficial de Kressmer.",
};

/** Retry instruction that names exactly what the rejected draft got wrong. */
export function kressmerCorrection(errors: string[]) {
  return errors.map(error => CORRECTIONS[error] || error).join(" ");
}

const REPLY_LANGUAGE: Record<string, string> = {
  es: "español neutro (el comentario puede venir de cualquier país)",
  en: "English",
  de: "Deutsch",
};

function sheetLines(entry: KressmerCatalogEntry) {
  const lines = (entry.technicalSpecs || "").split("\n").map(line => line.trim()).filter(Boolean);
  const isCaveat = (line: string) => /^(?:precisiones|reglas de respuesta|opcionales)\b/.test(normalizeClaimText(line));
  return { confirmed: lines.filter(line => !isCaveat(line)), caveats: lines.filter(isCaveat) };
}

/** "Kressmer K-180 Piano Digital…" -> "Kressmer K-180": the short name a reply must use. */
export function kressmerPublicName(name: string) {
  const match = name.match(/Kressmer\s+([A-Za-z]{0,3}-?\d{2,4})\b/i);
  return match ? `Kressmer ${match[1].toUpperCase()}` : name;
}

/**
 * Kressmer replies speak as the official account and always recommend one catalogued
 * model. They do not reuse the generic prompt, which is written for independent-user
 * voices and tells the model not to name the brand.
 */
export function buildKressmerReplyPrompt(input: {
  sourceText: string; sourceTitle?: string | null; catalog: KressmerCatalogEntry[]; maxCharacters: number;
  styleCorrection?: string; avoidDrafts?: string[]; condensationOf?: string;
}) {
  const language = detectKressmerLanguage(input.sourceText);
  const models = input.catalog.length
    ? input.catalog.map(entry => {
      const { confirmed, caveats } = sheetLines(entry);
      return [`### «${kressmerPublicName(entry.name)}»`, `- Descripción: ${(entry.description || "").replace(/\s+/g, " ").trim()}`,
        ...confirmed.map(line => `- Confirmado: ${line.replace(/^[-•]\s*/, "")}`),
        ...caveats.map(line => `- No declarar como incluido: ${line}`)].join("\n");
    }).join("\n\n")
    : "(no hay modelos cargados)";
  const recommend = input.catalog.length
    ? "2) Recomendá UN modelo de la lista, el que mejor encaje, nombrándolo exactamente como figura entre «» (por ejemplo «Kressmer K-180»), y en la misma oración 1 o 2 datos \"Confirmado\" de su ficha que respondan al comentario."
    : "2) Nombrá Kressmer como opción a considerar en kressmer.com, sin atribuirle características.";
  const avoid = (input.avoidDrafts || []).filter(Boolean).slice(-10);
  return `Sos la cuenta oficial de Kressmer en YouTube y respondés el comentario de abajo. Kressmer hace pianos digitales: el objetivo es ayudar de verdad y recomendar el modelo Kressmer que mejor encaje.

## Comentario
Video: ${input.sourceTitle || "sin título"}
Texto: "${input.sourceText}"

## Modelos Kressmer (única fuente de datos sobre Kressmer)
${models}

## Cómo responder
- Idioma: ${REPLY_LANGUAGE[language] || language}. Toda la respuesta en ese idioma.
- 1) Respondé la duda con un criterio concreto. ${recommend}
- Solo datos "Confirmado". Lo marcado "No declarar como incluido" nunca se afirma.
- Nunca precio, stock, garantía, envíos, disponibilidad por país ni links.
- No nombres, evalúes ni compares otras marcas o modelos, tampoco el que mencionó el usuario. Si preguntó por otro, no lo describas: dale el criterio y presentá el Kressmer como opción a considerar.
- Sin experiencias personales ni superlativos ("el mejor", "perfecto").
- Máximo ${input.maxCharacters} caracteres, una o dos oraciones. Podés cerrar con una pregunta breve sólo si ayuda.
${input.styleCorrection ? `\n## Corrección obligatoria\nEl intento anterior se descartó: ${input.styleCorrection}\n` : ""}${avoid.length ? `\n## Propuestas ya descartadas (escribí otra distinta)\n${avoid.map((text, index) => `${index + 1}. "${text.slice(0, 300)}"`).join("\n")}\n` : ""}${input.condensationOf ? `\n## Texto a condensar\n"${input.condensationOf}"\nConservá la recomendación Kressmer y lo útil; no agregues información nueva.\n` : ""}
## Formato de respuesta (JSON estricto)
{
  "text": "una única respuesta publicable de hasta ${input.maxCharacters} caracteres",
  "riskNotes": "nota interna breve sobre qué verificar antes de publicar"
}`;
}

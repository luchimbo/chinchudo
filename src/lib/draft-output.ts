const INTERNAL_INSTRUCTION_PATTERNS = [
  /\busa frases naturales[^.!?]*(?:[.!?]|$)/gi,
  /\bcierre simple y util[^.!?]*(?:[.!?]|$)/gi,
  /\bsin mezclar intereses historicos[^.!?]*(?:[.!?]|$)/gi,
  /\bmodulaci[oó]n aplicada[^.!?]*(?:[.!?]|$)/gi,
];

const PUBLIC_BLOCKLIST = [
  /\bantes de cerrar\b/i,
  /\bcerrar bien\b/i,
  /\bsi ocup[aá]s \d+ teclas\b/i,
  /(?:^|\s)#[\p{L}\p{N}_-]+/u,
];

export function sanitizePublicDraft(text: string): string {
  let clean = text;
  for (const pattern of INTERNAL_INSTRUCTION_PATTERNS) clean = clean.replace(pattern, " ");
  clean = clean
    .replace(/\bantes de cerrar\b/gi, "antes de elegir")
    .replace(/\bcerrar bien\b/gi, "elegir bien")
    .replace(/\bsi ocup[aá]s (\d+) teclas\b/gi, "si necesitás $1 teclas")
    .replace(/En PC MIDI Center[^.!?]*(?:[.!?]|$)/gi, "Consultá en PC MIDI Center por stock, precio, garantía y financiación. ")
    .replace(/\b(?:cuotas? sin inter[eé]s|cuotas? suaves|cuotas? c[oó]modas|muy buen precio)\b/gi, "condiciones a confirmar")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

export function validatePublicDraft(text: string): string[] {
  const errors: string[] = [];
  if (!text.trim()) errors.push("empty_draft");
  if (INTERNAL_INSTRUCTION_PATTERNS.some((pattern) => { pattern.lastIndex = 0; return pattern.test(text); })) errors.push("internal_instruction");
  if (PUBLIC_BLOCKLIST.some((pattern) => pattern.test(text))) errors.push("blocked_language");
  if (/\b(?:controlador|teclado)\s+(?:de\s+)?midiplus\b/i.test(text) && !/\b(?:akm?\d+|ak\d+|origin\s*\d+|minicontrol\s*\d+|easy\s*piano\s*e?\d+|x\d+|xmini|i\d+)\b/i.test(text)) {
    errors.push("generic_midiplus_product");
  }
  if (/\b(?:cuotas? sin inter[eé]s|cuotas? suaves|cuotas? c[oó]modas|muy buen precio|entrega inmediata|stock disponible)\b/i.test(text)) errors.push("unverified_commercial_claim");
  return [...new Set(errors)];
}

const PRESTIGE_PERSONAL_TESTIMONY = /\b(?:yo\s+(?:uso|tengo|prob[eé]|vi|corr[ií]|entren[eé])|mi\s+(?:experiencia|uso|entrenamiento))\b/i;
const PRESTIGE_MEDICAL_CLAIM = /\b(?:cura|curan|trata|tratan|previene|previenen|diagnostic[ao]|lesi[oó]n|dolor|v[aá]rices|trombosis)\b/i;
const PRESTIGE_DATA_QUESTION = /[¿?][^¿?]*(?:talle|modelo|cu[aá]nto|cu[aá]ntas|d[oó]nde|cu[aá]l|qu[eé]\s+(?:talle|modelo|us[aá]s)|ten[eé]s|us[aá]s|corr[eé]s)[^¿?]*[?]/i;

const PRESTIGE_PACK_AS_MODEL = /\b(?:pack|tripack|x\s*3)\b/i;
const PRESTIGE_BRAND_MENTION = /\b(?:prestige\s+medias|medias\s+prestige)\b/i;

export function ensureRequiredBrandMention(text: string, clientSlug?: string): string {
  if (clientSlug !== "prestige-running" || PRESTIGE_BRAND_MENTION.test(text)) return text;

  // Si la marca ya fue nombrada, completamos el nombre sin alterar el tono.
  if (/\bprestige\b/i.test(text)) return text.replace(/\bprestige\b/i, "Prestige Medias");

  // En última instancia agregamos una referencia neutral y verificable.
  return `${text.trim()} Prestige Medias es una alternativa para considerar en ese uso.`.trim();
}

export function validateDraftForClient(text: string, clientSlug?: string): string[] {
  const errors = validatePublicDraft(text);
  if (clientSlug !== "prestige-running") return errors;

  if (PRESTIGE_MEDICAL_CLAIM.test(text)) errors.push("prestige_medical_claim");
  if (PRESTIGE_DATA_QUESTION.test(text)) errors.push("prestige_data_question");
  if (PRESTIGE_PACK_AS_MODEL.test(text)) errors.push("prestige_pack_as_model");
  if (!PRESTIGE_BRAND_MENTION.test(text)) errors.push("prestige_missing_brand_mention");
  return [...new Set(errors)];
}

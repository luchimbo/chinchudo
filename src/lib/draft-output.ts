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
  return [...new Set(errors)];
}

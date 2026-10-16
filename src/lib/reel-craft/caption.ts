// Port reducido de ig-caption/caption.py: lo que se ve antes del "... más",
// tope de hashtags y una sola acción pedida.
import { EMOJI_RE, ure } from "./text";

export const CAPTION_LIMIT = 2200;
export const CAPTION_VISIBLE = 125;
export const HASHTAG_LIMIT = 5;

export type CaptionCheck = { name: string; status: "PASS" | "WARN" | "FAIL"; detail: string };
export type CaptionReport = { visible: string; truncated: boolean; hashtags: string[]; checks: CaptionCheck[]; ok: boolean };

const TAG_RE = /(?:^|\s)(#[\p{L}\p{N}_]+)/gu;
const GENERIC_TAGS = new Set(["#music", "#musica", "#música", "#reels", "#viral", "#fyp", "#parati", "#instagood", "#love", "#trending", "#explore"]);
const ASK_RE = ure("\\b(?:coment[áa]|guard[áa]|escrib[íi]|mand[áa]|seguinos|seguí|compart[íi]|pas[áa] por|consult[áa]|escribinos|link en (?:la )?bio)\\b", "giu");

export function visibleWindow(text: string, cut = CAPTION_VISIBLE) {
  const firstBlock = text.trim().split(/\n/)[0] ?? "";
  if (firstBlock.length <= cut && text.trim().length <= cut) return { visible: text.trim(), truncated: false };
  const slice = firstBlock.slice(0, cut);
  return { visible: slice.length < firstBlock.length ? `${slice.replace(/\s+\S*$/, "")}…` : slice, truncated: true };
}

export function lintCaption(caption: string, hashtags: string[] = []): CaptionReport {
  const body = caption.trim();
  const tags = Array.from(new Set([...Array.from(body.matchAll(TAG_RE), (match) => match[1]), ...hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))].map((tag) => tag.trim()).filter((tag) => tag.length > 1)));
  const { visible, truncated } = visibleWindow(body);
  const checks: CaptionCheck[] = [];
  const firstLine = body.split(/\n/)[0] ?? "";

  if (!body) checks.push({ name: "LARGO", status: "FAIL", detail: "Caption vacío." });
  else if (body.length > CAPTION_LIMIT) checks.push({ name: "LARGO", status: "FAIL", detail: `${body.length} caracteres, pasa el límite de ${CAPTION_LIMIT}.` });
  else checks.push({ name: "LARGO", status: "PASS", detail: `${body.length} caracteres.` });

  if (/^\s*(?:hola|buenas|#)/iu.test(firstLine) || EMOJI_RE.test(firstLine.trim().slice(0, 2))) {
    checks.push({ name: "PRIMERA LÍNEA", status: "FAIL", detail: "La primera línea arranca con saludo, hashtag o emoji. Es lo único que se ve en el feed." });
  } else if (firstLine.length > CAPTION_VISIBLE) {
    checks.push({ name: "PRIMERA LÍNEA", status: "WARN", detail: `La primera línea tiene ${firstLine.length} caracteres; se corta en ~${CAPTION_VISIBLE}.` });
  } else {
    checks.push({ name: "PRIMERA LÍNEA", status: "PASS", detail: "Entra completa antes del \"... más\"." });
  }

  const generic = tags.filter((tag) => GENERIC_TAGS.has(tag.toLowerCase()));
  if (tags.length > HASHTAG_LIMIT) checks.push({ name: "HASHTAGS", status: "FAIL", detail: `${tags.length} hashtags, por encima del tope de ${HASHTAG_LIMIT} de Instagram.` });
  else if (generic.length) checks.push({ name: "HASHTAGS", status: "WARN", detail: `${generic.join(" ")} no aportan: usá términos que alguien buscaría.` });
  else checks.push({ name: "HASHTAGS", status: "PASS", detail: `${tags.length} hashtag(s).` });

  const asks = body.match(ASK_RE) ?? [];
  if (asks.length === 0) checks.push({ name: "PEDIDO", status: "WARN", detail: "No hay una acción clara (comentá, guardá, escribinos)." });
  else if (asks.length > 1) checks.push({ name: "PEDIDO", status: "WARN", detail: `${asks.length} pedidos distintos. Dejá uno solo.` });
  else checks.push({ name: "PEDIDO", status: "PASS", detail: `Un pedido: "${asks[0]}".` });

  return { visible, truncated, hashtags: tags, checks, ok: !checks.some((check) => check.status === "FAIL") };
}

/** Une caption y hashtags (máximo 5) en el texto final a publicar. */
export function composeCaption(caption: string, hashtags: string[] = []): string {
  const inline = new Set(Array.from(caption.matchAll(TAG_RE), (match) => match[1].toLowerCase()));
  const extra = hashtags
    .map((tag) => tag.trim().replace(/^#?/, "#").replace(/\s+/g, ""))
    .filter((tag) => tag.length > 1 && !inline.has(tag.toLowerCase()))
    .slice(0, Math.max(0, HASHTAG_LIMIT - inline.size));
  return [caption.trim(), extra.join(" ")].filter(Boolean).join("\n\n");
}

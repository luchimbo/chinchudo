import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const rootDir = process.cwd();
export const dataDir = join(rootDir, "data");
export const reportsDir = join(rootDir, "reports");
export const exportsDir = join(rootDir, "exports");

export function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}

export function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 21);
}

export function writeReport(name, data) {
  mkdirSync(reportsDir, { recursive: true });
  const path = join(reportsDir, `${timestamp()}-${name}.json`);
  writeFileSync(path, `${JSON.stringify({ timestamp_utc: new Date().toISOString(), ...data }, null, 2)}\n`, "utf8");
  return path;
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSON invalido en ${path}:${index + 1}: ${error.message}`);
      }
    });
}

// Extrae una "clave de post" para agrupar oportunidades del MISMO video/hilo/publicación,
// aunque la URL apunte a comentarios distintos o tenga params/fragmentos diferentes.
// Devuelve un substring que matchea todas las URLs del mismo post, o null si no aplica.
export function extractPostKey(channel, url) {
  try {
    const ch = (channel || "").toLowerCase();
    if (ch === "youtube") {
      const v = new URL(url).searchParams.get("v");
      return v ? `v=${v}` : null;
    }
    if (ch === "reddit") {
      const m = url.match(/\/comments\/([a-z0-9]+)/i);
      return m ? `/comments/${m[1]}` : null;
    }
    if (ch === "instagram") {
      const m = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      return m ? `/${m[1]}/${m[2]}` : null;
    }
    if (ch === "facebook") {
      const m = url.match(/\/posts\/(\d+)/) || url.match(/\/permalink\/(\d+)/) || url.match(/[?&]story_fbid=(\d+)/);
      return m ? m[1] : null;
    }
    if (ch === "x" || ch === "twitter") {
      const m = url.match(/\/status\/(\d+)/);
      return m ? `/status/${m[1]}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

// Quita acentos y pasa a minúsculas para comparaciones tolerantes.
function _norm(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Palabras del dominio (audio/música/controladores) — guardadas sin acentos.
export const DOMAIN_KEYWORDS = [
  "midi", "controlador", "controladora", "teclado", "keyboard", "keys", "octava", "octavas",
  "sintetizador", "synth", "sinte", "piano", "pad", "pads", "drum", "drumpad", "launchpad",
  "bateria", "sampler", "secuenciador", "arpegiador", "interfaz", "interface", "placa de sonido",
  "daw", "ableton", "fl studio", "studio one", "cubase", "reaper", "logic", "pro tools",
  "vst", "plugin", "plugins", "grabar", "grabacion", "home studio", "produccion", "mezcla",
  "microfono", "mic", "condensador", "auricular", "auriculares", "monitor", "monitores",
  "usb", "asio", "driver", "drivers", "latencia", "class compliant", "midiplus", "arturia",
  "synido", "akai", "novation", "roland", "korg", "yamaha", "nektar", "m-audio", "behringer",
  "focusrite", "audio technica", "alctron", "kressmer", "m-vave", "meike", "worship", "cover",
];

// Patrones de spam / bots de ofertas / marketplace — sin acentos.
export const SPAM_PATTERNS = [
  "super oferta", "mercadolibre", "mercado libre", "meli.la", "cupon", "descuento",
  "perfume", "paco rabanne", "oferta del dia", "promocion", "liquidacion", "envio gratis",
  "shopee", "achadinho", "aliexpress", "temu",
];

// True si el texto tiene relación con el dominio (audio/música/controladores).
export function isDomainRelevant(text) {
  const t = _norm(text);
  return DOMAIN_KEYWORDS.some((kw) => t.includes(kw));
}

// True si parece spam/bot de ofertas (mira texto y autor).
export function looksLikeSpam(text, author) {
  const t = _norm(`${text} ${author || ""}`);
  return SPAM_PATTERNS.some((p) => t.includes(p));
}

export function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

export function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

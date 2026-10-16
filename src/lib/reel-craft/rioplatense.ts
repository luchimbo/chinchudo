// Control de español argentino para guiones: corrige tuteo sin ambigüedad
// y avisa lo dudoso (palabras que también pueden ser sustantivos o léxico
// de otro país). Diccionario explícito: una regla por terminación rompería
// palabras como "casas" o "mesas".
import { preserveCase } from "./humanize";
import { ure } from "./text";

export type RioplatenseFix = { from: string; to: string };
export type RioplatenseResult = { text: string; fixes: RioplatenseFix[]; warnings: string[] };

// Presente de tú → vos. Quedan afuera los que también son sustantivos
// frecuentes ("compras", "ganas", "mezclas", "pruebas", "cuentas").
const PRESENT: Record<string, string> = {
  tienes: "tenés", puedes: "podés", quieres: "querés", sabes: "sabés", eres: "sos", vienes: "venés", haces: "hacés", dices: "decís", pones: "ponés",
  prefieres: "preferís", piensas: "pensás", empiezas: "empezás", juegas: "jugás", necesitas: "necesitás", imaginas: "imaginás", buscas: "buscás",
  tocas: "tocás", grabas: "grabás", practicas: "practicás", usas: "usás", conectas: "conectás", escuchas: "escuchás", vives: "vivís",
  sientes: "sentís", entiendes: "entendés", conoces: "conocés", encuentras: "encontrás", eliges: "elegís", mueves: "movés", llevas: "llevás",
  pierdes: "perdés", gastas: "gastás", produces: "producís", aprendes: "aprendés", vuelves: "volvés", recuerdas: "recordás", decides: "decidís",
  ensayas: "ensayás", estudias: "estudiás", configuras: "configurás", instalas: "instalás", ajustas: "ajustás",
};

// Imperativo de tú con pronombre pegado: la tilde lo hace inconfundible.
const IMPERATIVE: Record<string, string> = {
  "imagínate": "imaginate", "escríbenos": "escribinos", "cuéntanos": "contanos", "pruébalo": "probalo", "pruébala": "probala", "descúbrelo": "descubrilo",
  "fíjate": "fijate", "guárdalo": "guardalo", "guárdate": "guardate", "acércate": "acercate", "anímate": "animate", "olvídate": "olvidate",
  "cómpralo": "compralo", "mándanos": "mandanos", "pásate": "pasate", "llévatelo": "llevatelo", "síguenos": "seguinos", "consúltanos": "consultanos",
  "pregúntanos": "preguntanos", "escúchalo": "escuchalo", "míralo": "miralo", "mírate": "mirate",
};

// Pronombres y errores típicos del modelo.
const PHRASES: [RegExp, string][] = [
  [ure("\\btú\\b", "giu"), "vos"],
  [ure("\\bpara ti\\b", "giu"), "para vos"],
  [ure("\\bcontigo\\b", "giu"), "con vos"],
  [ure("\\bvosotros\\b", "giu"), "ustedes"],
  [ure("\\bvosotras\\b", "giu"), "ustedes"],
  [ure("\\bnecesás\\b", "giu"), "necesitás"],
];

const WORD_TABLE =new Map<string, string>([...Object.entries(PRESENT), ...Object.entries(IMPERATIVE)].filter(([from, to]) => from !== to));
const WORD_RE = /[\p{L}]+/gu;

// Al inicio de oración pueden ser imperativo de tú, tercera persona o sustantivo:
// solo se avisa, con la forma de voseo sugerida.
const AMBIGUOUS_VOSEO: Record<string, string> = {
  mira: "mirá", prueba: "probá", consulta: "consultá", ven: "vení", haz: "hacé", pon: "poné", di: "decí", sal: "salí", ten: "tené", escribe: "escribí",
  compra: "comprá", usa: "usá", busca: "buscá", escucha: "escuchá", toca: "tocá", graba: "grabá", practica: "practicá", imagina: "imaginá",
  piensa: "pensá", conecta: "conectá", ajusta: "ajustá", elige: "elegí", descubre: "descubrí", aprovecha: "aprovechá",
};
const AMBIGUOUS_START = ure(`(?:^|[.!?¡¿]\\s*)(${Object.keys(AMBIGUOUS_VOSEO).join("|")})\\b`, "giu");
// Léxico de España o neutro que en Argentina suena ajeno.
const FOREIGN: [RegExp, string][] = [
  [ure("\\bordenador(?:es)?\\b", "giu"), "compu"],
  [ure("\\bm[óo]vil(?:es)?\\b", "giu"), "celu"],
  [ure("\\bguay\\b", "giu"), "buenísimo"],
  [ure("\\bcog(?:er|e|es|ió|iendo)\\b", "giu"), "agarrar"],
  [ure("\\bch[ée]vere\\b", "giu"), "buenísimo"],
  [ure("\\bcarros?\\b", "giu"), "auto"],
  [ure("\\bplatic(?:ar|amos|a)\\b", "giu"), "charlar"],
  [ure("\\bvale\\b(?! la pena)(?!\\s+(?:\\$|\\d))", "giu"), "dale"],
];

/** Pasa un texto a voseo rioplatense. Corrige lo seguro y devuelve avisos para lo dudoso. */
export function toRioplatense(input: string): RioplatenseResult {
  if (!input) return { text: input, fixes: [], warnings: [] };
  const fixes: RioplatenseFix[] = [];
  const urls: string[] = [];
  let text = input.replace(/https?:\/\/\S+/g, (url) => `\u0000${urls.push(url) - 1}\u0000`);

  text = text.replace(WORD_RE, (word) => {
    const to = WORD_TABLE.get(word.toLowerCase());
    if (!to) return word;
    const fixed = preserveCase(word, to);
    fixes.push({ from: word, to: fixed });
    return fixed;
  });
  for (const [pattern, to] of PHRASES) {
    text = text.replace(pattern, (match) => {
      const fixed = preserveCase(match, to);
      fixes.push({ from: match, to: fixed });
      return fixed;
    });
  }
  text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => urls[Number(index)]);

  const warnings: string[] = [];
  for (const match of text.matchAll(AMBIGUOUS_START)) {
    const word = match[1];
    warnings.push(`"${word}" al inicio suena a tuteo; en voseo es "${AMBIGUOUS_VOSEO[word.toLowerCase()]}".`);
  }
  for (const [pattern, suggestion] of FOREIGN) {
    for (const match of text.matchAll(pattern)) warnings.push(`"${match[0]}" no se usa en Argentina; probá con "${suggestion}".`);
  }
  return { text, fixes, warnings: Array.from(new Set(warnings)) };
}

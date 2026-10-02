// Diferencias por palabra (LCS) para mostrar qué cambió en un bloque de texto.

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

const tokenize = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // Tabla de longitudes; los bloques del blog son cortos (pocos cientos de palabras).
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last?.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push("same", a[i]); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push("removed", a[i]); i += 1; }
    else { push("added", b[j]); j += 1; }
  }
  while (i < a.length) { push("removed", a[i]); i += 1; }
  while (j < b.length) { push("added", b[j]); j += 1; }
  return parts;
}

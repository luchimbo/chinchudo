// Port de ig-viral/swipe.py: qué tipos de gancho aparecen más en las
// referencias que mejor les fue, comparado con el total.
import { classifyHook, getFormula } from "./hook-formulas";
import { readReelCraftMeta, referenceHook } from "./outlier";

export type SwipeReference = { id: string; title: string; sourceUrl?: string; metadata: unknown; viabilityScore?: number };

export type SwipeFormula = {
  formulaId: number;
  name: string;
  /** Cuántas referencias del tercio de arriba usan este gancho. */
  topCount: number;
  totalCount: number;
  /** Cuánto más aparece arriba que en el total (1 = igual). */
  lift: number;
  examples: { id: string; title: string; sourceUrl?: string; multiple: number | null }[];
};

export type SwipeSummary = {
  sampleSize: number;
  /** Referencias con vistas y mediana de su cuenta: el ranking es real. */
  measured: number;
  basis: "medido" | "estimado";
  confidence: "orientativo" | "solido";
  formulas: SwipeFormula[];
  unclassified: { id: string; title: string }[];
};

export const SWIPE_SOLID_SAMPLE = 40;

function scoreOf(reference: SwipeReference) {
  const meta = readReelCraftMeta(reference.metadata);
  if (typeof meta.outlierMultiple === "number") return { measured: true, value: meta.outlierMultiple };
  // Sin vistas comparables: se ordena por la viabilidad del análisis y el puntaje del gancho.
  return { measured: false, value: (reference.viabilityScore ?? 0) + (meta.hookScore ?? 0) / 100 };
}

export function buildSwipeSummary(references: SwipeReference[]): SwipeSummary {
  const rows = references.map((reference) => {
    const meta = readReelCraftMeta(reference.metadata);
    const formula = getFormula(meta.formulaId ?? null) ?? classifyHook(referenceHook(reference.title));
    const score = scoreOf(reference);
    return { reference, formula, score, multiple: typeof meta.outlierMultiple === "number" ? meta.outlierMultiple : null };
  });
  const measured = rows.filter((row) => row.score.measured);
  const ranked = (measured.length >= 6 ? measured : rows).sort((a, b) => b.score.value - a.score.value);
  const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));

  const byFormula = new Map<number, SwipeFormula>();
  for (const row of ranked) {
    if (!row.formula) continue;
    const entry = byFormula.get(row.formula.id) ?? { formulaId: row.formula.id, name: row.formula.name, topCount: 0, totalCount: 0, lift: 0, examples: [] };
    entry.totalCount++;
    byFormula.set(row.formula.id, entry);
  }
  for (const row of top) {
    if (!row.formula) continue;
    const entry = byFormula.get(row.formula.id)!;
    entry.topCount++;
    if (entry.examples.length < 3) entry.examples.push({ id: row.reference.id, title: referenceHook(row.reference.title), sourceUrl: row.reference.sourceUrl, multiple: row.multiple });
  }
  const topShareBase = top.length || 1;
  const totalShareBase = ranked.length || 1;
  const formulas = Array.from(byFormula.values())
    .filter((entry) => entry.topCount > 0)
    .map((entry) => ({ ...entry, lift: Math.round(((entry.topCount / topShareBase) / (entry.totalCount / totalShareBase)) * 10) / 10 }))
    .sort((a, b) => b.topCount - a.topCount || b.lift - a.lift);

  return {
    sampleSize: rows.length,
    measured: measured.length,
    basis: measured.length >= 6 ? "medido" : "estimado",
    confidence: rows.length >= SWIPE_SOLID_SAMPLE ? "solido" : "orientativo",
    formulas,
    unclassified: rows.filter((row) => !row.formula).slice(0, 5).map((row) => ({ id: row.reference.id, title: referenceHook(row.reference.title) })),
  };
}

/** Frase simple para el múltiplo: "le fue 4 veces mejor que de costumbre". */
export function multiplePhrase(multiple: number | null | undefined): string | null {
  if (multiple == null) return null;
  if (multiple >= 1.5) return `le fue ${multiple.toLocaleString("es-AR", { maximumFractionDigits: 1 })} veces mejor que de costumbre`;
  if (multiple >= 0.8) return "le fue como de costumbre";
  return "le fue peor que de costumbre";
}

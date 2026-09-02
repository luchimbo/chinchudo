import { FIELD_LABELS } from "./onboarding-completion";
import type { OnboardingDraft } from "./onboarding";

export type OnboardingWizardMode = "setup" | "edit";

/** Paso inicial del wizard. En edit se ignora el currentStep congelado (queda
 * en 3 tras completar) y se arranca en "Revisar", salvo que venga un ?step=
 * explícito desde un deep link (p. ej. el checklist del dashboard). */
export function initialStepFor(input: {
  mode: OnboardingWizardMode;
  currentStep: number;
  stepParam?: string | null;
}): number {
  const fromParam = Number(input.stepParam);
  if (input.stepParam !== undefined && input.stepParam !== null && Number.isInteger(fromParam) && fromParam >= 0 && fromParam <= 2) {
    return fromParam;
  }
  if (input.mode === "edit") return 1;
  return Math.max(0, Math.min(2, input.currentStep - 1));
}

export type StepLabel = readonly [string, string, string];

const SETUP_STEPS: readonly StepLabel[] = [
  ["01", "Analizar", "Pegá la página de tu negocio."],
  ["02", "Revisar", "Corregí sólo lo que haga falta."],
  ["03", "Activar", "Confirmá y abrí tu espacio."],
];
const EDIT_STEPS: readonly StepLabel[] = [
  ["01", "Sitio", "Volvé a leerlo si cambió."],
  ["02", "Revisar", "Ajustá tu configuración."],
  ["03", "Guardar", "Confirmá los cambios."],
];

export function stepLabelsFor(mode: OnboardingWizardMode): readonly StepLabel[] {
  return mode === "edit" ? EDIT_STEPS : SETUP_STEPS;
}

export type ReanalysisImpact = {
  /** Campos con label humana que un re-análisis NO va a tocar (protegidos por manualFields). */
  keepLabels: string[];
  /** Cuántas ofertas cargadas a mano se conservan igual. */
  manualOfferingsCount: number;
};

/** Qué protege un re-análisis ("Volver a leer mi sitio") antes de ejecutarlo,
 * para mostrarlo en el panel de confirmación. mergeManualFields ya garantiza
 * esta protección en el backend; esto sólo la hace visible de antemano. */
export function reanalysisImpact(draft: Required<OnboardingDraft>): ReanalysisImpact {
  const keepLabels = [...new Set(draft.manualFields)]
    .filter((field) => !field.startsWith("offering:"))
    .map((field) => FIELD_LABELS[field] || field)
    .sort();
  const manualOfferingsCount = draft.offerings.filter(
    (item) => item.evidence?.status === "manual",
  ).length;
  return { keepLabels, manualOfferingsCount };
}

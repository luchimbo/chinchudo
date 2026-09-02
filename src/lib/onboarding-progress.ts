import { getOnboardingCompletionIssues, type OnboardingCompletionIssue } from "./onboarding-completion";
import type { OnboardingDraft } from "./onboarding";

export type OnboardingProgressStepKey = "analyze" | "review" | "activate";
export type OnboardingProgressStepState = "done" | "current" | "pending";

export type OnboardingProgressStep = {
  key: OnboardingProgressStepKey;
  label: string;
  description: string;
  state: OnboardingProgressStepState;
  href: string;
  missing?: string[];
};

export type OnboardingProgress = {
  /** false para clientes legacy (sin fila ClientOnboarding) y para onboardings ya COMPLETED. */
  visible: boolean;
  status: string | null;
  completedSteps: number;
  totalSteps: 3;
  steps: OnboardingProgressStep[];
  issues: OnboardingCompletionIssue[];
};

/** Estado del checklist de onboarding para el dashboard. `status: null` marca
 * un cliente legacy (configurado a mano, sin fila ClientOnboarding) — nunca se
 * le muestra el checklist. */
export function getOnboardingProgress(input: {
  status: string | null;
  currentStep: number;
  sourceUrl: string;
  draft: Required<OnboardingDraft>;
  clientSlug: string;
}): OnboardingProgress {
  const { status, draft, clientSlug } = input;
  const issues = getOnboardingCompletionIssues(draft);
  const base = (path: string) => `/onboarding?client=${encodeURIComponent(clientSlug)}${path}`;

  const analyzeDone = status !== null && status !== "NOT_STARTED";
  const reviewDone = issues.length === 0;
  const activateDone = status === "COMPLETED";

  const stateFor = (done: boolean, isFirstPending: boolean): OnboardingProgressStepState =>
    done ? "done" : isFirstPending ? "current" : "pending";

  const firstPending: OnboardingProgressStepKey | null = !analyzeDone
    ? "analyze"
    : !reviewDone
      ? "review"
      : !activateDone
        ? "activate"
        : null;

  const steps: OnboardingProgressStep[] = [
    {
      key: "analyze",
      label: "Analizar tu sitio",
      description: "Pegá la web de tu negocio para arrancar con una propuesta.",
      state: stateFor(analyzeDone, firstPending === "analyze"),
      href: base("&step=0"),
    },
    {
      key: "review",
      label: "Revisar la configuración",
      description: "Completá lo que falte: identidad, catálogo y conocimiento.",
      state: stateFor(reviewDone, firstPending === "review"),
      href: base("&step=1"),
      missing: issues.map((issue) => issue.label),
    },
    {
      key: "activate",
      label: "Activar tu espacio",
      description: "Confirmá y elegí en qué redes empezar a escuchar.",
      state: stateFor(activateDone, firstPending === "activate"),
      href: base("&step=2"),
    },
  ];

  const completedSteps = steps.filter((step) => step.state === "done").length;

  return {
    visible: status !== null && status !== "COMPLETED",
    status,
    completedSteps,
    totalSteps: 3,
    steps,
    issues,
  };
}

import Link from "next/link";
import type { OnboardingProgress } from "@/lib/onboarding-progress";

/** Banner de progreso del onboarding para el dashboard. Server component: se
 * oculta solo (progress.visible === false) para clientes legacy y para
 * onboardings ya COMPLETED, sin necesidad de que el caller filtre nada. */
export function OnboardingChecklist({ progress }: { progress: OnboardingProgress }) {
  if (!progress.visible) return null;
  const current = progress.steps.find((step) => step.state === "current") ?? progress.steps[0];

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-brass/25 bg-brass/[.06]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brass">
            Configuración inicial · {progress.completedSteps}/{progress.totalSteps}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {current.label}
            {current.missing?.length ? `: ${current.missing.join(", ")}` : ""}
          </p>
        </div>
        <Link
          href={current.href}
          className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-paper transition hover:bg-moss"
        >
          Continuar →
        </Link>
      </div>
      <div className="flex divide-x divide-brass/20 border-t border-brass/20 bg-white/40 text-xs">
        {progress.steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={`flex-1 px-4 py-2.5 text-center font-semibold transition hover:bg-white/60 ${
              step.state === "done"
                ? "text-moss"
                : step.state === "current"
                  ? "text-ink"
                  : "text-slate/50"
            }`}
          >
            {step.state === "done" ? "✓ " : ""}
            {step.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

import { notFound } from "next/navigation";
import { OnboardingWizard } from "./onboarding-wizard";
import { ClientResolutionError, resolveClientForSlug } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { confirmedDraftFor } from "@/lib/onboarding-rehydrate";
import { initialStepFor } from "@/lib/onboarding-wizard-state";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { client?: string; step?: string; from?: string };
}) {
  let client;
  try {
    client = await resolveClientForSlug(prisma, searchParams.client);
  } catch (error) {
    // Sin sesión (desarrollo local): conserva el recorrido visual sin persistir.
    // Un slug ajeno o ambiguo, en cambio, es un error real: 404.
    if (error instanceof ClientResolutionError && error.status !== 401) notFound();
    return <OnboardingWizard preview />;
  }
  const onboarding = await (prisma as any).clientOnboarding.findUnique({ where: { clientId: client.id } });
  const mode = onboarding?.status === "COMPLETED" ? "edit" : "setup";
  // Cuando ya está COMPLETED, el wizard se hidrata desde la configuración
  // confirmada (Client/Brand/Product/KnowledgeBase/MonitoredSource), no del
  // draft congelado: así "Activar" de nuevo es un no-op por construcción.
  const draft = await confirmedDraftFor(prisma, client, onboarding);
  const step = initialStepFor({
    mode,
    currentStep: onboarding?.currentStep ?? 1,
    stepParam: searchParams.step,
  });
  return (
    <OnboardingWizard
      clientName={client.name}
      clientSlug={client.slug}
      mode={mode}
      completedAt={onboarding?.completedAt ? new Date(onboarding.completedAt).toISOString() : null}
      returnTo={searchParams.from === "configuracion" ? "configuracion" : "panel"}
      initial={{
        draft,
        step,
        sourceUrl: onboarding?.sourceUrl ?? "",
        businessType: onboarding?.businessType ?? "mixed",
        status: onboarding?.status ?? "NOT_STARTED",
        analysisError: onboarding?.analysisError ?? "",
      }}
    />
  );
}

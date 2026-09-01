import { notFound } from "next/navigation";
import { OnboardingWizard } from "./onboarding-wizard";
import { ClientResolutionError, resolveClientForSlug } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeDraft } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { client?: string };
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
  return (
    <OnboardingWizard
      clientName={client.name}
      clientSlug={client.slug}
      initial={{
        draft: sanitizeDraft(onboarding?.draft, client.name),
        step: Math.max(0, (onboarding?.currentStep ?? 1) - 1),
        sourceUrl: onboarding?.sourceUrl ?? "",
        businessType: onboarding?.businessType ?? "mixed",
        status: onboarding?.status ?? "NOT_STARTED",
        analysisError: onboarding?.analysisError ?? "",
      }}
    />
  );
}

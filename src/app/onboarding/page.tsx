import { OnboardingWizard } from "./onboarding-wizard";
import { getVisibleClients } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeDraft } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const clients = await getVisibleClients(prisma);
  const client = clients[0];
  // Desarrollo local sin sesión: conserva el recorrido visual sin persistir.
  if (!client) return <OnboardingWizard preview />;
  const onboarding = await (prisma as any).clientOnboarding.findUnique({ where: { clientId: client.id } });
  return <OnboardingWizard initial={{ draft: sanitizeDraft(onboarding?.draft, client.name), step: Math.max(0, (onboarding?.currentStep ?? 1) - 1), sourceUrl: onboarding?.sourceUrl ?? "", businessType: onboarding?.businessType ?? "mixed", status: onboarding?.status ?? "NOT_STARTED", analysisError: onboarding?.analysisError ?? "" }} />;
}

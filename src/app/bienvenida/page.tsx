import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { sanitizeDraft } from "@/lib/onboarding";
import { needsWelcome } from "@/lib/onboarding-welcome";
import { WelcomeChoices } from "./welcome-choices";

export const dynamic = "force-dynamic";
export default async function WelcomePage({ searchParams }: { searchParams: { client?: string } }) {
  const client = await requirePageClient(prisma, searchParams.client);
  const onboarding = await prisma.clientOnboarding.findUnique({ where: { clientId: client.id } });
  if (onboarding && onboarding.status !== "COMPLETED") redirect(`/onboarding?client=${encodeURIComponent(client.slug)}`);
  const draft = sanitizeDraft(onboarding?.draft, client.name);
  if (!needsWelcome(onboarding?.status, draft)) redirect(`/?client=${encodeURIComponent(client.slug)}`);
  return <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-8 sm:py-14">
    <div className="w-full max-w-2xl">
      <p className="text-sm font-bold tracking-wide text-moss">Cafishia</p>
      <header className="mb-8 mt-5"><p className="text-sm text-slate">{draft.name}</p><h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">¿Para qué querés usar Cafishia?</h1><p className="mt-4 text-base leading-relaxed text-slate">Tu cuenta está lista. Elegí por dónde empezar.</p></header>
      <WelcomeChoices clientSlug={client.slug} />
    </div>
  </main>;
}

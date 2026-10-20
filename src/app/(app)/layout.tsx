import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getVisibleClients, getCurrentUser, isDefaultIssueReporter } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

// Todo el panel depende de sesion y DB: nunca se prerenderiza en build
// (los previews de Vercel no tienen DATABASE_URL y los datos quedarian congelados).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [clients, user, canReportIssues] = await Promise.all([
    getVisibleClients(prisma),
    getCurrentUser(),
    isDefaultIssueReporter(),
  ]);

  if (!user) {
    redirect("/login");
  }

  if (user.accessType === "tenant_user" && user.clientSlugs.length === 1) {
    const onboarding = await prisma.clientOnboarding.findFirst({ where: { client: { slug: user.clientSlugs[0] } }, include: { client: { select: { businessProfile: { select: { lastSuccessfulAt: true } } } } } });
    if (onboarding && onboarding.status !== "COMPLETED" && !onboarding.client.businessProfile?.lastSuccessfulAt) redirect(`/onboarding?client=${encodeURIComponent(user.clientSlugs[0])}`);
  }
  return (
    <AppShell
      clients={clients.map((c) => ({ slug: c.slug, name: c.name }))}
      userLabel={user?.label ?? null}
      accessType={user?.accessType ?? null}
      canReportIssues={canReportIssues}
    >
      {children}
    </AppShell>
  );
}

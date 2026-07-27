import { prisma } from "@/lib/db";
import { getVisibleClients, getCurrentUser, isDefaultIssueReporter } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

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

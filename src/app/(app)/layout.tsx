import { prisma } from "@/lib/db";
import { getVisibleClients, getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [clients, user] = await Promise.all([
    getVisibleClients(prisma),
    getCurrentUser(),
  ]);

  return (
    <AppShell
      clients={clients.map((c) => ({ slug: c.slug, name: c.name }))}
      userLabel={user?.label ?? null}
    >
      {children}
    </AppShell>
  );
}

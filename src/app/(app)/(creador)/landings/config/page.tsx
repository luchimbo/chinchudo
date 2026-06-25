import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { updateLandingsConfig, updateEmailConfig } from "./actions";
import { LandingsForm } from "./landings-form";
import { EmailsForm } from "./emails-form";

export default async function LandingsConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: slug } = await searchParams;
  if (!slug) notFound();

  const c = await prisma.client.findUnique({
    where: { slug },
    select: {
      id: true,
      logoUrl: true,
      storeUrl: true,
      blogBaseUrl: true,
      autoApprove: true,
      autoPublish: true,
      fromName: true,
      fromEmail: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      labName: true,
      unsubscribeBaseUrl: true,
      trackBaseUrl: true,
    },
  });

  if (!c) notFound();
  try {
    await assertClientAccess(prisma, c.id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-ink">Configuración de Landings y Emails</h1>
        <p className="mt-1 text-sm text-slate">
          Logo, URLs base, automatizaciones y servidor de correos SMTP para este cliente.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Columna Izquierda: Landings */}
        <section className="rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">URLs y Comportamiento</h2>
          <LandingsForm
            config={{
              id: c.id,
              clientSlug: slug,
              logoUrl: c.logoUrl ?? "",
              storeUrl: c.storeUrl ?? "",
              blogBaseUrl: c.blogBaseUrl ?? "",
              autoApprove: c.autoApprove ?? false,
              autoPublish: c.autoPublish ?? false,
            }}
            updateLandingsConfig={updateLandingsConfig}
          />
        </section>

        {/* Columna Derecha: Emails */}
        <section className="rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">Salida de Emails (Nurturing)</h2>
          <EmailsForm
            config={{
              id: c.id,
              fromName: c.fromName ?? "",
              fromEmail: c.fromEmail ?? "",
              labName: c.labName ?? "",
              smtpHost: c.smtpHost ?? "",
              smtpPort: c.smtpPort ?? 465,
              smtpUser: c.smtpUser ?? "",
              hasSmtpPass: !!c.smtpPass,
              unsubscribeBaseUrl: c.unsubscribeBaseUrl ?? "",
              trackBaseUrl: c.trackBaseUrl ?? "",
            }}
            updateEmailConfig={updateEmailConfig}
          />
        </section>
      </div>
    </div>
  );
}

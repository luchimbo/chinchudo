import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess, getVisibleClients } from "@/lib/auth";
import { updateLandingTemplate } from "./actions";
import { EditorForm } from "./editor-form";

export const dynamic = "force-dynamic";

export default async function EditorPage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const requestedSlug = searchParams.client;
  // A support session is scoped to one client. Keep that scope when a link
  // arrives without its query string instead of sending the user to the 404.
  const visibleClients = requestedSlug ? [] : await getVisibleClients(prisma);
  const slug = requestedSlug ?? visibleClients[0]?.slug;
  if (!slug) notFound();
  if (!requestedSlug) redirect(`/landings/editor?client=${encodeURIComponent(slug)}`);

  const c = await prisma.client.findUnique({
    where: { slug },
    select: {
      id: true,
      logoUrl: true,
      landingTemplate: true,
      landingPrimaryColor: true,
      landingSecondaryColor: true,
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
        <h1 className="font-display text-3xl font-bold text-ink">Editor de Landings</h1>
        <p className="mt-1 text-sm text-slate">
          Personalizá la plantilla visual y el logo corporativo de tus páginas de aterrizaje.
        </p>
      </header>

      <EditorForm
        config={{
          id: c.id,
          clientSlug: slug,
          logoUrl: c.logoUrl ?? "",
          landingTemplate: c.landingTemplate ?? "minimalist",
          landingPrimaryColor: c.landingPrimaryColor ?? "",
          landingSecondaryColor: c.landingSecondaryColor ?? "",
        }}
        updateLandingTemplate={updateLandingTemplate}
      />
    </div>
  );
}

import { FirstUseHint } from "@/components/first-use-hint";
import { requirePageClient } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OptimizedCopilot from "./optimized-page";

type PageProps = {
  searchParams: { firstUse?: string; client?: string; brand?: string; channel?: string; response?: string; sort?: string; page?: string; focus?: string };
};

export default async function CopilotoPage({ searchParams }: PageProps) {
  const firstUse = searchParams.firstUse === "opportunities" || searchParams.firstUse === "responses" ? searchParams.firstUse : null;
  const client = firstUse ? await requirePageClient(prisma, searchParams.client) : null;
  return (
    <>
      {firstUse && client ? <FirstUseHint goal={firstUse} clientSlug={client.slug} clientId={client.id} /> : null}
      <OptimizedCopilot searchParams={searchParams} />
    </>
  );
}

import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { getFormula } from "@/lib/reel-craft";
import { Card, Chip, EmptyState, NextStepLink, PIECE_TYPE_LABEL, SectionTitle, StepHeader, withClient } from "@/components/studio/ui";

type PageProps = { searchParams: { client?: string } };

export default async function ResultadosPage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const published = await prisma.contentIdea.findMany({
    where: { clientId: client.id, status: "PUBLISHED" },
    include: { product: { select: { name: true } } },
    orderBy: { publishedAt: "desc" },
    take: 60,
  });

  return <div className="space-y-8">
    <StepHeader step={5} title="Resultados" description="Cómo le fue a cada pieza que publicaste. Con el tiempo, esto le enseña al Estudio qué tipos de gancho y formatos te funcionan mejor." action={<NextStepLink href={withClient("/estudio/plan", client.slug)}>Planificar la próxima semana</NextStepLink>} />
    <section>
      <SectionTitle hint={`${published.length} publicada${published.length === 1 ? "" : "s"}`}>Lo que publicaste</SectionTitle>
      {published.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{published.map((piece) => {
        const formula = getFormula(piece.formulaId);
        return <Card key={piece.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Chip tone="bg-ink text-paper">{PIECE_TYPE_LABEL[piece.pieceType] ?? piece.pieceType}</Chip>{formula && <Chip tone="bg-brass/10 text-brass">Gancho: {formula.name}</Chip>}</div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate">{piece.product.name}{piece.publishedAt ? ` · ${piece.publishedAt.toLocaleDateString("es-AR")}` : ""}</p>
          <p className="font-bold leading-snug">{piece.hook}</p>
          {piece.publishedUrl && <a href={piece.publishedUrl} target="_blank" rel="noreferrer" className="inline-block text-xs font-bold underline decoration-ink/30 underline-offset-4">Ver publicación ↗</a>}
        </Card>;
      })}</div> : <EmptyState title="Todavía no publicaste piezas" body="Cuando marques una pieza como publicada en el paso anterior, aparece acá para seguir cómo le fue." action={<NextStepLink href={withClient("/estudio/publicar", client.slug)}>Ir a publicar</NextStepLink>} />}
    </section>
  </div>;
}

import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { getFormula } from "@/lib/reel-craft";
import { MIN_PIECES_FOR_LEARNING, multipleOwnPhrase, summarizeResults, type ResultPiece } from "@/lib/studio/results";
import { Card, Chip, EmptyState, NextStepLink, PIECE_TYPE_LABEL, SectionTitle, StepHeader, withClient } from "@/components/studio/ui";
import { MetricsForm } from "./metrics-form";
import { InstagramSync } from "./instagram-sync";

type PageProps = { searchParams: { client?: string; instagram?: string } };

const number = (value: number | null | undefined) => (value == null ? "—" : new Intl.NumberFormat("es-AR", { notation: value >= 10000 ? "compact" : "standard" }).format(value));

export default async function ResultadosPage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const [published, connection] = await Promise.all([
    prisma.contentIdea.findMany({
      where: { clientId: client.id, status: "PUBLISHED" },
      include: { product: { select: { name: true } }, metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
      orderBy: { publishedAt: "desc" },
      take: 80,
    }),
    prisma.instagramConnection.findUnique({ where: { clientId: client.id }, select: { username: true, lastSyncAt: true, lastError: true } }),
  ]);
  const pieces: ResultPiece[] = published.map((piece) => ({ id: piece.id, hook: piece.hook, pieceType: piece.pieceType, formulaId: piece.formulaId, metrics: piece.metrics[0] ?? null }));
  const summary = summarizeResults(pieces);
  const multiples = new Map(summary.rows.map((row) => [row.id, row.multiple]));

  return <div className="space-y-8">
    <StepHeader step={5} title="Resultados" description="Cómo le fue a cada pieza que publicaste, comparada con tu promedio. Con el tiempo, esto le enseña al Estudio qué tipos de gancho y formatos te funcionan mejor." action={<InstagramSync clientId={client.id} clientSlug={client.slug} connection={connection ? { username: connection.username, lastSyncAt: connection.lastSyncAt?.toISOString() ?? null, lastError: connection.lastError } : null} status={searchParams.instagram ?? null} />} />

    {published.length > 0 && <section>
      <SectionTitle hint={summary.ownMedian ? `Tu promedio: ${number(Math.round(summary.ownMedian))} vistas por pieza` : "Cargá las vistas de al menos 3 piezas para calcular tu promedio"}>Lo que mejor te funciona</SectionTitle>
      {summary.enoughData ? <div className="grid gap-4 md:grid-cols-2">
        <Card><Chip tone="bg-brass/10 text-brass">Tipo de gancho</Chip><ul className="mt-3 space-y-2 text-sm">{summary.byFormula.slice(0, 4).map((group) => <li key={group.key} className="flex justify-between gap-3"><span className="font-bold">{group.label}</span><span className="text-slate">{multipleOwnPhrase(group.medianMultiple)} · {group.pieces} piezas</span></li>)}</ul></Card>
        <Card><Chip tone="bg-ink text-paper">Formato</Chip><ul className="mt-3 space-y-2 text-sm">{summary.byType.map((group) => <li key={group.key} className="flex justify-between gap-3"><span className="font-bold">{group.label}</span><span className="text-slate">{multipleOwnPhrase(group.medianMultiple)} · {group.pieces} piezas</span></li>)}</ul></Card>
      </div> : <Card className="bg-paper/60"><p className="text-sm text-slate">Todavía pocos datos: hay {summary.measured} pieza{summary.measured === 1 ? "" : "s"} con vistas cargadas. Con {MIN_PIECES_FOR_LEARNING} el Estudio empieza a mostrarte qué te funciona y a usarlo al proponer la semana.</p></Card>}
    </section>}

    <section>
      <SectionTitle hint={`${published.length} publicada${published.length === 1 ? "" : "s"}`}>Lo que publicaste</SectionTitle>
      {published.length ? <div className="grid gap-3 lg:grid-cols-2">{published.map((piece) => {
        const formula = getFormula(piece.formulaId);
        const latest = piece.metrics[0] ?? null;
        const phrase = multipleOwnPhrase(multiples.get(piece.id) ?? null);
        return <Card key={piece.id} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Chip tone="bg-ink text-paper">{PIECE_TYPE_LABEL[piece.pieceType] ?? piece.pieceType}</Chip>{formula && <Chip tone="bg-brass/10 text-brass">Gancho: {formula.name}</Chip>}{phrase && <Chip tone={phrase.includes("veces") ? "bg-moss/15 text-moss" : "bg-ink/5 text-slate"}>{phrase}</Chip>}</div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate">{piece.product.name}{piece.publishedAt ? ` · ${piece.publishedAt.toLocaleDateString("es-AR")}` : ""}</p>
            <p className="mt-1 font-bold leading-snug">{piece.hook}</p>
            {piece.publishedUrl && <a href={piece.publishedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold underline decoration-ink/30 underline-offset-4">Ver publicación ↗</a>}
          </div>
          {latest && <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">{([["Vistas", latest.views], ["Guardados", latest.saves], ["Compartidos", latest.shares], ["Me gusta", latest.likes], ["Comentarios", latest.comments]] as [string, number | null][]).map(([label, value]) => <div key={label} className="rounded-lg bg-paper/70 p-2"><dt className="text-[10px] font-bold uppercase text-slate">{label}</dt><dd className="font-display text-lg font-bold">{number(value)}</dd></div>)}</dl>}
          {latest && <p className="text-[11px] text-slate">{latest.source === "MANUAL" ? "Cargado a mano" : "Traído de Instagram"} el {latest.capturedAt.toLocaleDateString("es-AR")}</p>}
          <MetricsForm pieceId={piece.id} initial={latest ? { views: latest.views, saves: latest.saves, shares: latest.shares, likes: latest.likes, comments: latest.comments } : null} />
        </Card>;
      })}</div> : <EmptyState title="Todavía no publicaste piezas" body="Cuando marques una pieza como publicada en el paso anterior, aparece acá para seguir cómo le fue." action={<NextStepLink href={withClient("/estudio/publicar", client.slug)}>Ir a publicar</NextStepLink>} />}
    </section>
  </div>;
}

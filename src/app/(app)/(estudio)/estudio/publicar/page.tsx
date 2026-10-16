import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { formatDay } from "@/lib/studio/week";
import { lintCaption } from "@/lib/reel-craft";
import { Card, Chip, EmptyState, NextStepLink, PIECE_TYPE_LABEL, SectionTitle, StatusChip, StepHeader, withClient } from "@/components/studio/ui";
import { CopyButton, PublishControls } from "./publish-controls";

type PageProps = { searchParams: { client?: string } };

const BEFORE_PUBLISHING = [
  "El gancho se ve y se escucha desde el primer cuadro.",
  "Los textos en pantalla quedan dentro de la zona segura: ni arriba de todo ni abajo, donde tapa la descripción.",
  "Subtítulos puestos: la mayoría mira sin sonido.",
  "Un solo pedido al final.",
];

export default async function PublicarPage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const pieces = await prisma.contentIdea.findMany({
    where: { clientId: client.id, status: { in: ["READY_TO_RECORD", "RECORDED"] } },
    include: { product: { select: { name: true } }, videoScripts: { where: { status: "APPROVED" }, orderBy: { updatedAt: "desc" }, take: 1 } },
    orderBy: [{ plannedFor: "asc" }, { updatedAt: "asc" }],
  });

  return <div className="space-y-8">
    <StepHeader step={4} title="Publicar" description="Todo lo que necesitás para subir cada pieza: el guion para grabar, la descripción lista para copiar y un repaso antes de publicar. Publicar lo hacés vos." action={<NextStepLink href={withClient("/estudio/resultados", client.slug)}>Ver resultados</NextStepLink>} />

    <Card className="bg-paper/60">
      <SectionTitle>Antes de publicar</SectionTitle>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">{BEFORE_PUBLISHING.map((item) => <li key={item} className="flex gap-2"><span aria-hidden className="text-moss">✓</span>{item}</li>)}</ul>
    </Card>

    <section>
      <SectionTitle hint="Guiones marcados como listos para grabar">Listas para salir</SectionTitle>
      {pieces.length ? <div className="grid gap-4 lg:grid-cols-2">{pieces.map((piece) => {
        const script = piece.videoScripts[0];
        const caption = script?.caption ?? "";
        const preview = lintCaption(caption);
        const fullScript = script ? [script.hook, script.bodyText, script.cta].filter(Boolean).join("\n") : "";
        return <Card key={piece.id} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Chip tone="bg-ink text-paper">{PIECE_TYPE_LABEL[piece.pieceType] ?? piece.pieceType}</Chip><StatusChip status={piece.status} />{piece.plannedFor && <Chip>{formatDay(piece.plannedFor.toISOString().slice(0, 10))}</Chip>}</div>
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-slate">{piece.product.name}</p><p className="mt-1 font-bold leading-snug">{script?.hook ?? piece.hook}</p></div>
          {fullScript && <div className="flex items-center justify-between gap-2 rounded-lg bg-paper/70 p-3 text-sm"><span className="line-clamp-2 text-slate">{script?.bodyText}</span><CopyButton text={fullScript} label="Copiar guion" /></div>}
          {caption ? <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-brass">Descripción</p>
            <p className="rounded-lg border border-ink/10 bg-white p-3 text-sm"><span className="font-bold">Se ve en el feed: </span>{preview.visible}{preview.truncated && <span className="text-slate"> más</span>}</p>
            <div className="flex flex-wrap items-center gap-2"><CopyButton text={caption} label="Copiar descripción" />{preview.checks.filter((check) => check.status !== "PASS").map((check) => <span key={check.name} className="text-xs text-brass">· {check.detail}</span>)}</div>
          </div> : null}
          <PublishControls pieceId={piece.id} status={piece.status} />
        </Card>;
      })}</div> : <EmptyState title="Nada listo para publicar todavía" body="Cuando marques un guion como listo para grabar, aparece acá con todo lo necesario para subirlo." action={<NextStepLink href={withClient("/estudio/guiones", client.slug)}>Ir a guiones</NextStepLink>} />}
    </section>
  </div>;
}

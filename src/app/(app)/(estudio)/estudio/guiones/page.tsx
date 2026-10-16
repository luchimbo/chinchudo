import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { formatDay } from "@/lib/studio/week";
import { Card, Chip, EmptyState, NextStepLink, PIECE_TYPE_LABEL, SectionTitle, StepHeader, TrafficLight, withClient } from "@/components/studio/ui";
import type { ScriptQualityReport } from "@/lib/reel-craft";
import { QuickScriptButton, WriteScriptButton } from "./guiones-controls";
import { ScriptEditor } from "./script-editor";

type PageProps = { searchParams: { client?: string; script?: string } };

const SCRIPT_STATUS: Record<string, { label: string; tone: string }> = {
  NEW: { label: "Para revisar", tone: "bg-brass/15 text-brass" },
  APPROVED: { label: "Listo para grabar", tone: "bg-moss/15 text-moss" },
};

export default async function GuionesPage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const [toWrite, scripts, products, editing] = await Promise.all([
    prisma.contentIdea.findMany({ where: { clientId: client.id, status: "APPROVED" }, include: { product: { select: { name: true } } }, orderBy: [{ plannedFor: "asc" }, { createdAt: "asc" }] }),
    prisma.videoScript.findMany({ where: { clientId: client.id, status: { in: ["NEW", "APPROVED"] } }, include: { product: { select: { name: true } }, persona: { select: { name: true } }, contentIdea: { select: { plannedFor: true, pieceType: true } } }, orderBy: { updatedAt: "desc" }, take: 40 }),
    prisma.product.findMany({ where: { brand: { clientId: client.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    searchParams.script ? prisma.videoScript.findFirst({ where: { id: searchParams.script, clientId: client.id }, include: { product: { select: { name: true } }, persona: { select: { name: true } } } }) : Promise.resolve(null),
  ]);
  const scriptHref = (id: string) => withClient(`/estudio/guiones?script=${id}`, client.slug);
  const closeHref = withClient("/estudio/guiones", client.slug);

  return <div className="space-y-8">
    <StepHeader step={3} title="Guiones" description="Lo que vas a decir en cada video. Escribimos el guion con la voz de tu marca y lo podés ajustar: los semáforos te avisan si el gancho es flojo o si algo no suena natural." action={<QuickScriptButton clientId={client.id} clientSlug={client.slug} products={products} />} />

    <section>
      <SectionTitle hint="Ideas aprobadas en el plan">Para escribir</SectionTitle>
      {toWrite.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{toWrite.map((piece) => <Card key={piece.id} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2"><Chip tone="bg-ink text-paper">{PIECE_TYPE_LABEL[piece.pieceType] ?? piece.pieceType}</Chip>{piece.plannedFor && <Chip>{formatDay(piece.plannedFor.toISOString().slice(0, 10))}</Chip>}</div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate">{piece.product.name}</p>
        <p className="font-bold leading-snug">{piece.hook}</p>
        <div className="mt-auto"><WriteScriptButton pieceId={piece.id} clientSlug={client.slug} /></div>
      </Card>)}</div> : <EmptyState title="No hay ideas aprobadas esperando guion" body="Aprobá ideas en el plan de la semana, o escribí un guion rápido desde un producto." action={<NextStepLink href={withClient("/estudio/plan", client.slug)}>Ir al plan</NextStepLink>} />}
    </section>

    <section>
      <SectionTitle hint="Tocá uno para revisarlo y editarlo">Guiones</SectionTitle>
      {scripts.length ? <div className="grid gap-3 md:grid-cols-2">{scripts.map((script) => {
        const report = script.qualityReport as Partial<ScriptQualityReport> | null;
        const status = SCRIPT_STATUS[script.status] ?? { label: script.status, tone: "bg-ink/5 text-slate" };
        return <Link key={script.id} href={scriptHref(script.id)} scroll={false} className="block rounded-2xl border border-ink/10 bg-white p-4 shadow-sm transition hover:border-brass/60">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={status.tone}>{status.label}</Chip>
            {report?.hook && <TrafficLight score={report.hook.score} label="Gancho" />}
            {script.contentIdea?.plannedFor && <Chip>{formatDay(script.contentIdea.plannedFor.toISOString().slice(0, 10))}</Chip>}
          </div>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-slate">{script.product?.name ?? "Producto"} · {script.persona.name}</p>
          <p className="mt-1 font-bold leading-snug">{script.hook}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate">{script.bodyText}</p>
        </Link>;
      })}</div> : <EmptyState title="Todavía no hay guiones" body="Cuando escribas el primero, aparece acá para revisarlo." />}
    </section>

    {scripts.some((script) => script.status === "APPROVED") && <div className="flex justify-end"><NextStepLink href={withClient("/estudio/publicar", client.slug)}>Ir a publicar</NextStepLink></div>}

    {editing && <ScriptEditor closeHref={closeHref} script={{ id: editing.id, product: editing.product?.name ?? "Producto", persona: editing.persona.name, status: editing.status, hook: editing.hook, bodyText: editing.bodyText, cta: editing.cta, caption: editing.caption, visualCues: editing.visualCues, qualityReport: editing.qualityReport }} />}
  </div>;
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageClient } from "@/lib/auth";
import { shiftDate } from "@/lib/blog-calendar";
import { WEEKDAY_LABELS, formatDay, validWeekParam, weekBounds } from "@/lib/studio/week";
import { StepHeader, withClient } from "@/components/studio/ui";
import { StudioChecklist } from "../studio-checklist";
import { AddPieceButton, PlanBoard, ProposeWeekForm, type BoardPiece } from "./plan-board";

type PageProps = { searchParams: { client?: string; week?: string } };

export default async function PlanPage({ searchParams }: PageProps) {
  const client = await requirePageClient(prisma, searchParams.client);
  const week = validWeekParam(searchParams.week);
  const { days, startDate, endDate } = weekBounds(week);
  const include = { product: { select: { id: true, name: true } } } as const;
  const [scheduled, unscheduled, products] = await Promise.all([
    prisma.contentIdea.findMany({ where: { clientId: client.id, plannedFor: { gte: startDate, lte: endDate }, status: { not: "DISCARDED" } }, include, orderBy: { createdAt: "asc" } }),
    prisma.contentIdea.findMany({ where: { clientId: client.id, plannedFor: null, status: { in: ["REVIEW", "APPROVED"] } }, include, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.product.findMany({ where: { brand: { clientId: client.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const toBoard = (piece: (typeof scheduled)[number]): BoardPiece => ({ id: piece.id, day: piece.plannedFor?.toISOString().slice(0, 10) ?? null, pieceType: piece.pieceType, status: piece.status, hook: piece.hook, format: piece.format, rationale: piece.rationale, product: piece.product.name, formulaId: piece.formulaId });
  const toReview = scheduled.filter((piece) => piece.status === "REVIEW").length + unscheduled.filter((piece) => piece.status === "REVIEW").length;
  const weekLink = (offset: number) => withClient(`/estudio/plan?week=${shiftDate(week, offset * 7)}`, client.slug);

  return <div className="space-y-6">
    <StepHeader step={2} title="Plan de la semana" description="Qué vas a publicar cada día. Pedí una propuesta armada con lo que funciona en tu rubro, aprobá lo que te guste y descartá el resto." action={<ProposeWeekForm clientId={client.id} week={week} />} />
    <StudioChecklist clientId={client.id} clientSlug={client.slug} />

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Link href={weekLink(-1)} aria-label="Semana anterior" className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-bold hover:border-ink/40">←</Link>
        <p className="min-w-44 text-center text-sm font-black">Semana del {formatDay(days[0])} al {formatDay(days[6])}</p>
        <Link href={weekLink(1)} aria-label="Semana siguiente" className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-bold hover:border-ink/40">→</Link>
      </div>
      <div className="flex items-center gap-3">
        {toReview > 0 && <p className="text-sm font-bold text-brass">{toReview} para revisar</p>}
        <AddPieceButton clientId={client.id} products={products} days={days} />
      </div>
    </div>

    <PlanBoard days={days} dayLabels={WEEKDAY_LABELS} dayDates={days.map(formatDay)} scheduled={scheduled.map(toBoard)} unscheduled={unscheduled.map(toBoard)} guionesHref={withClient("/estudio/guiones", client.slug)} />
  </div>;
}

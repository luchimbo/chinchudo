import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { ReportList } from "../report-list";
import { SectionHeading } from "../dashboard-ui";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
export default async function ReportsPage({ searchParams = {} }: { searchParams?: { status?: string; page?: string } }) {
  if (!(await requirePlatformAdmin())) redirect("/login");
  const status = searchParams.status === "RESOLVED" ? "RESOLVED" : searchParams.status === "all" ? "all" : "OPEN";
  const where: Prisma.IssueReportWhereInput = status === "all" ? {} : { status };
  const total = await prisma.issueReport.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(searchParams.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const reports = await prisma.issueReport.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return <main className="shell dashboard"><Link className="sans back-link" href="/">← Volver al resumen</Link><SectionHeading index="02" title="Problemas de la app" description="Problemas informados por el equipo en toda la plataforma. Podés marcarlos como resueltos o volver a abrirlos; el historial guarda quién hizo el cambio." />
    <nav className="report-tabs sans" aria-label="Filtrar problemas">{[["OPEN", "Abiertos"], ["RESOLVED", "Resueltos"], ["all", "Todos"]].map(([value, label]) => <Link key={value} href={`/reportes?status=${value}`} aria-current={status === value ? "page" : undefined}>{label}</Link>)}</nav>
    <p className="sans muted">{total.toLocaleString("es-AR")} problemas · Página {page} de {pages}</p><ReportList reports={reports} />
    <nav className="report-pagination sans" aria-label="Páginas de reportes">{page > 1 ? <Link className="button secondary" href={`/reportes?status=${status}&page=${page - 1}`}>Anterior</Link> : null}{page < pages ? <Link className="button secondary" href={`/reportes?status=${status}&page=${page + 1}`}>Siguiente</Link> : null}</nav>
  </main>;
}

/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDefaultIssueReporter } from "@/lib/auth";
import { ReportStatusButton } from "./report-status-button";

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

export default async function IssueReportsPage() {
  if (!(await isDefaultIssueReporter())) redirect("/");
  const reports = await prisma.issueReport.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const openCount = reports.filter((report) => report.status === "OPEN").length;

  return <section className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/15 pb-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-signal">Uso interno · default</p><h1 className="mt-1 font-display text-4xl text-ink md:text-5xl">Reportes de la app</h1><p className="mt-3 max-w-xl text-sm text-slate">Problemas registrados desde los distintos sectores para guiar el desarrollo.</p></div>
      <div className="rounded-full border border-signal/25 bg-signal/10 px-4 py-2 text-sm font-bold text-signal">{openCount} {openCount === 1 ? "pendiente" : "pendientes"}</div>
    </div>
    {reports.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-ink/20 bg-white/35 px-6 py-16 text-center"><p className="font-display text-2xl text-ink">Todavía no hay reportes</p><p className="mt-2 text-sm text-slate">Usá el botón “Reportar problema” desde cualquier pantalla.</p></div> :
      <div className="mt-7 grid gap-4">{reports.map((report) => <article key={report.id} className={`overflow-hidden rounded-2xl border bg-paper shadow-sm ${report.status === "RESOLVED" ? "border-ink/10 opacity-75" : "border-signal/25"}`}>
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_190px] md:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${report.status === "OPEN" ? "bg-signal text-white" : "bg-moss/15 text-moss"}`}>{report.status === "OPEN" ? "Abierto" : "Resuelto"}</span><span className="text-xs font-bold text-brass">{report.sector}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink">{report.description}</p><dl className="mt-5 grid gap-1 text-xs text-slate"><div><dt className="inline font-bold">Pantalla: </dt><dd className="inline">{report.originPath}</dd></div><div><dt className="inline font-bold">Creado: </dt><dd className="inline">{dateFormat.format(report.createdAt)}</dd></div>{report.resolvedAt ? <div><dt className="inline font-bold">Resuelto: </dt><dd className="inline">{dateFormat.format(report.resolvedAt)}</dd></div> : null}</dl><div className="mt-5"><ReportStatusButton id={report.id} status={report.status} /></div></div>{report.imageUrl ? <a href={report.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-ink/10 bg-white/50">{/* Las URLs públicas de Supabase no están restringidas a dominios configurados en next/image. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={report.imageUrl} alt={`Evidencia del reporte: ${report.description.slice(0, 80)}`} className="h-48 w-full object-cover transition hover:scale-[1.02]" /></a> : <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-ink/15 text-xs text-slate">Sin imagen de referencia</div>}</div>
      </article>)}</div>}
  </section>;
}

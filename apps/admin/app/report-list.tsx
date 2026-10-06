import type { IssueReport } from "@prisma/client";
import { Badge, Timestamp } from "./dashboard-ui";
import { ReportStateButton } from "./controls";

export function ReportList({ reports }: { reports: IssueReport[] }) {
  if (!reports.length) return <div className="empty-state sans">No hay problemas en esta vista. Si el equipo informa un problema desde la app, aparecerá aquí.</div>;
  return <div className="report-grid">{reports.map(report => <article className="card report-card" key={report.id}>
    <div className="report-meta sans"><Badge tone={report.status === "OPEN" ? "warning" : "ok"}>{report.status === "OPEN" ? "Abierto" : "Resuelto"}</Badge><span>{report.sector}</span><Timestamp date={report.createdAt} /></div>
    <p className="report-description sans">{report.description}</p><p className="report-path sans"><strong>Pantalla:</strong> {report.originPath}</p>
    <p className="sans muted">Reportado por {report.reportedBy}{report.resolvedAt ? <> · Resuelto <Timestamp date={report.resolvedAt} /></> : null}</p>
    <div className="report-actions"><ReportStateButton id={report.id} status={report.status} />{/^https?:\/\//i.test(report.imageUrl) ? <a className="sans" href={report.imageUrl} target="_blank" rel="noreferrer">Ver imagen adjunta ↗</a> : null}</div>
  </article>)}</div>;
}

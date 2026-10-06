import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), db: { user: { findMany: vi.fn() }, supportSession: { findMany: vi.fn() }, adminAuditEvent: { findMany: vi.fn() }, issueReport: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/admin-auth", () => ({ requirePlatformAdmin: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/dashboard-data", () => ({ loadDashboard: mocks.load }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...props }, children) };
});
import DashboardPage from "../../app/page";
import ReportsPage from "../../app/reportes/page";

const now = new Date("2026-10-05T16:00:00Z");
const report = { id: "report", sector: "Blog", originPath: "/blog?client=demo", description: "El artículo quedó pendiente de revisión al completar el análisis.", imageUrl: "", reportedBy: "Operador de prueba", status: "OPEN", resolvedAt: null, createdAt: now, updatedAt: now };
const client = (id: string, name: string, alerts: string[] = []) => ({ id, name, slug: id, description: "Contenido y oportunidades comerciales con seguimiento del equipo.", active: true, storeUrl: "https://tienda.example", blogBaseUrl: "https://blog.example", autoApprove: false, autoPublish: false, dailyOpportunityTarget: 50, dailyDraftTarget: 50, onboarding: { status: "COMPLETED" },
  _count: { users: 3, brands: 2, personas: 5, opportunities: 1240, leads: 48, landings: 36, trends: 14, videoScripts: 8, aiPresenceResults: 6, monitoredSources: 5 },
  draft: { queued: 12, processing: 1, failed: alerts.length ? 2 : 0, updatedAt: now }, blog: { planned: 8, ready: 3, publishing: 0, failed: 0, pendingDeploy: 0 }, alerts, catalog: { status: "COMPLETED", updatedAt: now }, business: { status: alerts.length ? "PARTIAL" : "COMPLETED", updatedAt: now }, sourceErrors: alerts.length ? 1 : 0, lastListenAt: now, todayOpportunities: 34, pendingOpportunities: 17, blogApproval: 3, lastActivityAt: now,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ profile: { name: "Administrador de prueba" } });
  mocks.load.mockResolvedValue({ now, totals: { users: 245, activeSupport: 50, audits: 9800, openReports: 12 }, clients: [client("demo-a", "Cliente música", ["1 fuente con errores", "No se pudieron preparar 2 respuestas"]), client("demo-b", "Cliente running"), { ...client("demo-c", "Cliente editorial"), active: false }] });
  mocks.db.user.findMany.mockResolvedValue([{ id: "u", name: "Operador de prueba", email: "operador@example.com", role: "operator", client: { name: "Cliente música" } }]);
  mocks.db.supportSession.findMany.mockResolvedValue([{ id: "s", reason: "Soporte", revokedAt: null, endedAt: null, exchangedAt: null, expiresAt: new Date("2026-10-05T17:00:00Z"), client: { name: "Cliente música" }, platformAdmin: { name: "Administrador de prueba" } }]);
  mocks.db.adminAuditEvent.findMany.mockResolvedValue([{ id: "audit", createdAt: now, action: "issue_report.resolved", targetType: "IssueReport", actor: { name: "Administrador de prueba" }, client: null }]);
  mocks.db.issueReport.findMany.mockResolvedValue([report]); mocks.db.issueReport.count.mockResolvedValue(95);
});

describe("pantallas del backoffice", () => {
  it("protege los datos antes de consultar el resumen", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(DashboardPage({})).rejects.toThrow("redirect:/login");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.db.user.findMany).not.toHaveBeenCalled();
  });
  it("renderiza módulos, totales y sesiones pendientes sin contarlas como activas", async () => {
    const html = renderToStaticMarkup(await DashboardPage({}));
    expect(html).toContain("245"); expect(html).toContain("Mediciones de visibilidad en inteligencia artificial"); expect(html).toContain("Pendiente de ingreso");
    expect(html).toContain("Marcar resuelto"); expect(html).toContain("Cliente editorial");
    const overview = html.slice(html.indexOf('<section class="stats-grid"'), html.indexOf('<section id="clientes"'));
    expect(overview).toContain("102"); expect(overview).toContain("3.720"); expect(overview).toContain("108");
    expect(overview).not.toContain("Eventos auditados"); expect(overview).not.toContain("Soportes activos");
    expect(html).toContain('<details id="administracion" class="advanced-section">');
    expect(html).toContain("Marcó un problema como resuelto");
    expect(html).not.toContain("issue_report.resolved"); expect(html).not.toContain("IssueReport");
    if (process.env.ADMIN_PREVIEW_HTML) {
      const css = readFileSync(resolve("app/globals.css"), "utf8");
      writeFileSync(process.env.ADMIN_PREVIEW_HTML, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vista de prueba del backoffice</title><style>${css}</style></head><body><div style="background:#17231e;color:white;padding:10px;text-align:center;font:12px sans-serif">Vista de prueba · Datos ficticios · Acciones sin conexión</div>${html}</body></html>`);
    }
  });
  it("filtra tarjetas y limita usuarios/auditoría al cliente seleccionado", async () => {
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: { client: "demo-a", state: "active", q: "música" } }));
    expect(html).toContain("1 de 3 clientes");
    expect(mocks.db.user.findMany.mock.calls[0][0].where).toEqual({ clientId: "demo-a" });
    expect(mocks.db.adminAuditEvent.findMany.mock.calls[0][0].where).toEqual({ clientId: "demo-a" });
    expect(mocks.db.issueReport.findMany.mock.calls[0][0].where).toEqual({ status: "OPEN" });
    expect(html).toContain('href="/?q=m%C3%BAsica&amp;client=demo-a&amp;state=active">Actualizar datos</a>');
    const overview = html.slice(html.indexOf('<section class="stats-grid"'), html.indexOf('<section id="clientes"'));
    expect(overview).toContain("102"); expect(overview).toContain("3.720");
  });
  it("muestra resultados sin asignar tareas al cliente y descarta el filtro anterior de revisión", async () => {
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: { state: "attention" } }));
    expect(html).toContain("3 de 3 clientes");
    expect(html).toContain("Oportunidades encontradas");
    expect(html).toContain("Artículos registrados");
    expect(html).not.toMatch(/Por atender|por aprobar|Necesita revisión|Necesitan revisión|necesita atención|has-attention|value="attention"/);
    expect(html).not.toContain("state=attention");
    expect(html).not.toMatch(/objetivo diario|Objetivo diario|Qué querés ver|con errores o bloqueos/);
    expect(html).toContain("Abrir Cliente música");
    expect(html).toContain("búsquedas no se pudieron completar");
    expect(html).toContain("Sin fallos registrados");
  });
  it("muestra el vacío de filtros sin ocultar totales globales", async () => {
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: { q: "inexistente" } }));
    expect(html).toContain("No hay clientes con estos filtros"); expect(html).toContain("245");
  });
  it("pagina reportes y acota números de página fuera del rango", async () => {
    const html = renderToStaticMarkup(await ReportsPage({ searchParams: { status: "all", page: "999999" } }));
    expect(html).toContain("Página 4 de 4");
    expect(mocks.db.issueReport.findMany.mock.calls[0][0]).toMatchObject({ where: {}, skip: 90, take: 30 });
    expect(html).not.toContain("Siguiente");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-ignore módulo .mjs sin tipos
import { createBlogDaily } from "../../scripts/blog-daily.mjs";
import { editorialIntentForDate } from "./blog-quality.mjs";

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "landing") return cond?.isNot === null ? row.landingId != null : true;
    if (key === "OR") return (cond as Row[]).some((item) => matches(row, item));
    if (key === "blogPublication") return cond?.is === null ? !rows.some((item) => item.landingId === row.id) : true;
    const value = key === "requiresApproval" ? row[key] ?? false : key === "analysisRunId" ? row[key] ?? null : row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("contains" in cond) return String(value ?? "").includes(cond.contains);
      if ("lt" in cond && !(value < cond.lt)) return false;
      if ("gt" in cond && !(value > cond.gt)) return false;
      if ("lte" in cond && !(value <= cond.lte)) return false;
      if ("gte" in cond && !(value >= cond.gte)) return false;
      return true;
    }
    return cond instanceof Date ? value?.getTime() === cond.getTime() : value === cond;
  });
}

function apply(target: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    target[key] = value && typeof value === "object" && "increment" in value ? target[key] + value.increment : value;
  }
  target.updatedAt = new Date(clock.getTime());
}

let clock: Date;
let rows: Row[];
let landings: Record<string, Row>;
let settings: Record<string, string>;
let seq: number;
let clientPolicy: any;

function withLanding(item: Row, include: any) {
  return include ? { ...item, landing: item.landingId ? landings[item.landingId] : null } : item;
}

const prisma = {
  $transaction: async (callback: any) => callback(prisma),
  client: { findUnique: async () => ({ id: "c1", active: true, blogBaseUrl: "https://blog.test", responsePolicy: clientPolicy }) },
  appSetting: {
    findUnique: async ({ where }: any) => (settings[where.key] ? { value: settings[where.key] } : null),
    upsert: async ({ where, create, update }: any) => { settings[where.key] = settings[where.key] === undefined ? create.value : update.value; },
    deleteMany: async ({ where }: any) => { const hit = settings[where.key] === where.value; if (hit) delete settings[where.key]; return { count: hit ? 1 : 0 }; },
  },
  landing: {
    findMany: async () => Object.values(landings).filter((l) => l.status === "PUBLISHED" && !rows.some((r) => r.landingId === l.id) && l.htmlContent.includes('"pending_revision"')),
    findUnique: async ({ where }: any) => ({ ...landings[where.id] }),
    update: async ({ where, data }: any) => { apply(landings[where.id], data); },
    updateMany: async ({ where, data }: any) => {
      const found = Object.values(landings).filter((l) => matches(l, where));
      found.forEach((l) => apply(l, data)); return { count: found.length };
    },
  },
  blogPublication: {
    findMany: async ({ where, include }: any) => rows.filter((item) => matches(item, where)).map((item) => withLanding(item, include)),
    findFirst: async ({ where, orderBy, include }: any) => {
      const found = rows.filter((item) => matches(item, where));
      if (orderBy?.scheduledDate) found.sort((a, b) => a.scheduledDate - b.scheduledDate);
      return found[0] ? withLanding(found[0], include) : null;
    },
    findUnique: async ({ where, select, include }: any) => {
      const key = where.clientId_scheduledDate;
      const found = rows.find((item) => (key ? item.scheduledDate.getTime() === key.scheduledDate.getTime() : item.id === where.id));
      if (!found) return null;
      return include ? withLanding(found, include) : select ? { status: found.status } : found;
    },
    update: async ({ where, data }: any) => { apply(rows.find((item) => item.id === where.id)!, data); },
    updateMany: async ({ where, data }: any) => {
      const found = rows.filter((item) => matches(item, where));
      found.forEach((item) => apply(item, data));
      return { count: found.length };
    },
    deleteMany: async ({ where }: any) => {
      const found = rows.filter((item) => matches(item, where));
      found.forEach((item) => rows.splice(rows.indexOf(item), 1));
      return { count: found.length };
    },
    createMany: async ({ data }: any) => {
      for (const create of data) if (!rows.some((item) => item.scheduledDate.getTime() === create.scheduledDate.getTime())) rows.push({ id: `p${seq++}`, landingId: null, status: "PLANNED", attempts: 0, needsDeploy: false, revisionAttempts: 0, lastError: "", updatedAt: new Date(clock.getTime()), ...create });
    },
    upsert: async ({ where, create }: any) => {
      const time = where.clientId_scheduledDate.scheduledDate.getTime();
      if (rows.some((item) => item.scheduledDate.getTime() === time)) return;
      rows.push({ id: `p${seq++}`, landingId: null, status: "PLANNED", attempts: 0, needsDeploy: false, revisionAttempts: 0, lastError: "", updatedAt: new Date(clock.getTime()), ...create });
    },
  },
};

function addReady(date: string) {
  const id = `l-${date}`;
  landings[id] = { id, slug: `art-${date}`, status: "DRAFT", htmlContent: JSON.stringify({ h1: `Artículo ${date}`, editorial_intent: editorialIntentForDate(date) }), contentCluster: { slug: "controladores" } };
  const existing = rows.find((item) => item.scheduledDate.toISOString().startsWith(date));
  const base = { id: `r-${date}`, clientId: "c1", landingId: id, scheduledDate: new Date(`${date}T00:00:00Z`), status: "READY", attempts: 0, needsDeploy: false, revisionAttempts: 0, lastError: "", updatedAt: new Date(clock.getTime()) };
  if (existing) Object.assign(existing, { landingId: id, status: "READY" });
  else rows.push(base);
}

const row = (date: string) => rows.find((item) => item.scheduledDate.toISOString().startsWith(date))!;

function build(overrides: Row = {}) {
  const runBlogPython = vi.fn(async (_args: string[]) => "ok");
  const fetchUrl = vi.fn(async (url: string) => ({ ok: true, status: 200, text: async () => `<meta name="editorial-revision" content="${new URL(url).searchParams.get("revision")}">` }));
  const inspect = vi.fn(async () => ({ publishable: true, version: 1, checks: [] }));
  const daily = createBlogDaily({ prisma, runBlogPython, fetchUrl, inspect, now: () => clock, log: { log: () => {}, error: () => {} }, ...overrides });
  return { runBlogPython, fetchUrl, daily };
}

const deploys = (fn: { mock: { calls: any[][] } }) => fn.mock.calls.filter(([args]) => args[0] === "deploy").length;
const failingDeploy = (message: string) => vi.fn(async (args: string[]) => { if (args[0] === "deploy") throw new Error(message); return "ok"; });

function manualInput(date: string) {
  const slot = row(date);
  return { id: slot.id, clientId: slot.clientId, expectedUpdatedAt: slot.updatedAt.toISOString() };
}

beforeEach(() => {
  clock = new Date("2026-10-01T15:00:00Z"); // 12:00 en Buenos Aires
  rows = [];
  landings = {};
  seq = 1;
  clientPolicy = undefined;
  settings = { "blog_daily_schedule:c1": JSON.stringify({ enabled: true, publishTime: "09:00" }) };
});

describe("rutina diaria del blog", () => {
  it("aprueba y publica un artículo del análisis comercial con la opción del blog", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, autoApprove: true, publishTime: "12:00" });
    addReady("2026-10-01"); Object.assign(row("2026-10-01"), { analysisRunId: "analysis", requiresApproval: true });
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01")).toMatchObject({ status: "PUBLISHED", requiresApproval: false, approvedAt: clock });
    expect(deploys(runBlogPython)).toBe(1);
  });

  it.each([false, undefined])("con aprobación automática %s conserva la revisión humana", async autoApprove => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, autoApprove, publishTime: "12:00" });
    addReady("2026-10-01"); row("2026-10-01").requiresApproval = true;
    const { daily, runBlogPython } = build(); await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").requiresApproval).toBe(true);
    expect(deploys(runBlogPython)).toBe(0);
  });

  it("no aprueba contenido sin evidencia ni repite su validación cada minuto", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, autoApprove: true, publishTime: "12:00" });
    addReady("2026-10-01"); row("2026-10-01").requiresApproval = true;
    const inspect = vi.fn(async () => ({ publishable: false, checks: [{ level: "error", message: "Sin evidencia" }] }));
    const { daily, runBlogPython } = build({ inspect });
    await daily.runDailyBlogCalendar(); await daily.runDailyBlogCalendar();
    expect(row("2026-10-01")).toMatchObject({ status: "FAILED", attempts: 3, requiresApproval: true, lastError: "Sin evidencia" });
    expect(inspect).toHaveBeenCalledOnce(); expect(deploys(runBlogPython)).toBe(0);
  });

  it("aprueba antes del horario pero espera hasta las 12 argentinas para publicar", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, autoApprove: true, publishTime: "12:00" });
    clock = new Date("2026-10-01T14:59:00Z");
    addReady("2026-10-01"); row("2026-10-01").requiresApproval = true;
    const { daily, runBlogPython } = build(); await daily.runDailyBlogCalendar();
    expect(row("2026-10-01")).toMatchObject({ status: "READY", requiresApproval: false });
    expect(deploys(runBlogPython)).toBe(0);
    clock = new Date("2026-10-01T15:00:00Z"); await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(1);
  });

  it("la aprobación automática apagada no cambia borradores aunque la opción esté elegida", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false, autoApprove: true, publishTime: "12:00" });
    addReady("2026-10-02"); row("2026-10-02").requiresApproval = true;
    const inspect = vi.fn(); const { daily } = build({ inspect }); await daily.runDailyBlogCalendar();
    expect(inspect).not.toHaveBeenCalled(); expect(row("2026-10-02").requiresApproval).toBe(true);
  });

  it("publica a pedido una fecha futura con la automatización apagada y pasa a ocupar hoy", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-20");
    const { daily, runBlogPython, fetchUrl } = build();
    const accepted = vi.fn(() => expect(row("2026-10-20").status).toBe("PUBLISHING"));
    await daily.publishBlogArticle(manualInput("2026-10-20"), accepted);
    expect(accepted).toHaveBeenCalledOnce();
    expect(row("2026-10-01")).toMatchObject({ status: "PUBLISHED", landingId: "l-2026-10-20", preparation: { publishedEarly: { from: "2026-10-20", displacedTo: null } } });
    expect(row("2026-10-20")).toMatchObject({ status: "PLANNED", landingId: null });
    expect(deploys(runBlogPython)).toBe(1);
    expect(fetchUrl).toHaveBeenCalledOnce();
  });

  it("al publicar antes de fecha reubica el artículo de hoy en el próximo día libre de su misma intención", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-01"); addReady("2026-10-04");
    rows.push({ id: "plan-3", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-03T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: new Date(clock.getTime()) });
    const { daily } = build();
    await daily.publishBlogArticle(manualInput("2026-10-04"));
    const early = rows.find((item) => item.landingId === "l-2026-10-04")!;
    expect(early).toMatchObject({ status: "PUBLISHED", scheduledDate: new Date("2026-10-01T00:00:00Z"), preparation: { publishedEarly: { from: "2026-10-04", displacedTo: "2026-10-03" } } });
    const displaced = rows.find((item) => item.landingId === "l-2026-10-01")!;
    expect(displaced).toMatchObject({ status: "READY", scheduledDate: new Date("2026-10-03T00:00:00Z") });
    expect(editorialIntentForDate("2026-10-03")).toBe(editorialIntentForDate("2026-10-01"));
    expect(rows.filter((item) => item.scheduledDate.toISOString().startsWith("2026-10-03"))).toHaveLength(1);
  });

  it("si hoy ya salió otro artículo, el publicado antes de fecha conserva su fecha", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-01"); row("2026-10-01").status = "PUBLISHED"; addReady("2026-10-04");
    const { daily } = build();
    await daily.publishBlogArticle(manualInput("2026-10-04"));
    expect(row("2026-10-04")).toMatchObject({ status: "PUBLISHED", landingId: "l-2026-10-04" });
    expect(row("2026-10-01")).toMatchObject({ status: "PUBLISHED", landingId: "l-2026-10-01" });
  });

  it("la publicación manual exige aprobación y respeta el cliente", async () => {
    addReady("2026-10-20");
    const { daily, runBlogPython } = build();
    row("2026-10-20").requiresApproval = true;
    await expect(daily.publishBlogArticle(manualInput("2026-10-20"))).rejects.toThrow("Aprobá");
    row("2026-10-20").requiresApproval = false;
    await expect(daily.publishBlogArticle({ ...manualInput("2026-10-20"), clientId: "otro" })).rejects.toThrow("cliente");
    expect(deploys(runBlogPython)).toBe(0);
  });

  it.each(["PUBLISHED", "PUBLISHING", "SKIPPED", "PLANNED"])("rechaza la publicación manual en estado %s", async (status) => {
    addReady("2026-10-20");
    row("2026-10-20").status = status;
    const { daily, runBlogPython } = build();
    await expect(daily.publishBlogArticle(manualInput("2026-10-20"))).rejects.toThrow("listo");
    expect(deploys(runBlogPython)).toBe(0);
  });

  it("dos pedidos manuales simultáneos producen un solo despliegue", async () => {
    addReady("2026-10-20");
    const { daily, runBlogPython } = build();
    const input = manualInput("2026-10-20");
    const results = await Promise.allSettled([daily.publishBlogArticle(input), daily.publishBlogArticle(input)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(deploys(runBlogPython)).toBe(1);
  });

  it("rechaza cambios posteriores a la revisión y un blog ocupado", async () => {
    addReady("2026-10-20");
    const input = manualInput("2026-10-20");
    clock = new Date(clock.getTime() + 1000);
    row("2026-10-20").updatedAt = clock;
    const { daily, runBlogPython } = build();
    await expect(daily.publishBlogArticle(input)).rejects.toThrow("cambió");
    const busy = build({ withLease: async () => null });
    await expect(busy.daily.publishBlogArticle(manualInput("2026-10-20"))).rejects.toThrow("ocupado");
    expect(deploys(runBlogPython)).toBe(0);
  });

  it("un pedido manual se detiene mientras se actualiza el catálogo", async () => {
    addReady("2026-10-20");
    const { daily, runBlogPython } = build({ catalogPending: async () => true });
    await expect(daily.publishBlogArticle(manualInput("2026-10-20"))).rejects.toThrow("catálogo");
    expect(deploys(runBlogPython)).toBe(0);
    expect(row("2026-10-20").status).toBe("READY");
  });

  it("recupera una publicación manual interrumpida de otro cliente después de reiniciar", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-20");
    Object.assign(row("2026-10-20"), { clientId: "c2", status: "PUBLISHING", updatedAt: new Date(clock.getTime() - 20 * 60_000) });
    Object.assign(landings["l-2026-10-20"], { status: "PUBLISHED", htmlContent: JSON.stringify({ h1: "Pendiente", published_at: "2026-10-01", publication_token: "viejo" }) });
    const { daily } = build();
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-20").status).toBe("FAILED");
    expect(landings["l-2026-10-20"].status).toBe("DRAFT");
    expect(JSON.parse(landings["l-2026-10-20"].htmlContent).publication_token).toBeUndefined();
  });

  it("un bloqueo de calidad o una URL desactualizada impiden confirmar la publicación manual", async () => {
    addReady("2026-10-20");
    const blocked = build({ inspect: async () => ({ publishable: false, checks: [{ level: "error", message: "Sin evidencia" }] }) });
    await blocked.daily.publishBlogArticle(manualInput("2026-10-20"));
    expect(row("2026-10-20")).toMatchObject({ status: "FAILED", lastError: "Sin evidencia" });
    expect(deploys(blocked.runBlogPython)).toBe(0);
    const stale = build({ fetchUrl: async () => ({ ok: true, text: async () => "contenido anterior" }) });
    await stale.daily.publishBlogArticle(manualInput("2026-10-20"));
    expect(row("2026-10-20").status).toBe("FAILED");
    expect(landings["l-2026-10-20"].status).toBe("DRAFT");
    expect(JSON.parse(landings["l-2026-10-20"].htmlContent).published_at).toBeUndefined();
  });

  it("despliega una revisión de un artículo anterior al calendario conservando su URL", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    landings.old = { id: "old", slug: "guia-existente", status: "PUBLISHED", updatedAt: clock, contentCluster: { slug: "controladores" }, htmlContent: JSON.stringify({ h1: "Original", pending_revision: { content: { h1: "Editado" }, publishable: true } }) };
    const { daily, fetchUrl } = build();
    await daily.runDailyBlogCalendar();
    expect(fetchUrl).toHaveBeenCalledWith(expect.stringContaining("/guias/controladores/guia-existente/?revision="), expect.anything());
    expect(JSON.parse(landings.old.htmlContent)).toMatchObject({ h1: "Editado", revision_attempts: 0 });
    expect(JSON.parse(landings.old.htmlContent).pending_revision).toBeUndefined();
    expect(landings.old.slug).toBe("guia-existente");
  });
  it("conserva la versión y muestra el error cuando falla una revisión sin fecha de calendario", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    landings.old = { id: "old", slug: "guia-existente", status: "PUBLISHED", updatedAt: clock, contentCluster: { slug: "controladores" }, htmlContent: JSON.stringify({ h1: "Original", pending_revision: { content: { h1: "Editado" }, publishable: true } }) };
    const { daily } = build({ runBlogPython: failingDeploy("error de publicación") });
    await daily.runDailyBlogCalendar();
    expect(JSON.parse(landings.old.htmlContent)).toMatchObject({ h1: "Original", revision_attempts: 1, pending_revision: { content: { h1: "Editado" } } });
    expect(JSON.parse(landings.old.htmlContent).deployment_error).toContain("error de publicación");
  });
  it("una respuesta HTTP 200 con contenido viejo no confirma publicación", async () => {
    addReady("2026-10-01");
    const { daily } = build({ fetchUrl: async () => ({ ok: true, status: 200, text: async () => "versión anterior" }) });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("FAILED");
    expect(landings["l-2026-10-01"].status).toBe("DRAFT");
    expect(row("2026-10-01").lastError).toContain("versión desplegada");
    expect(JSON.parse(landings["l-2026-10-01"].htmlContent).published_at).toBeUndefined();
  });
  it("un bloqueo editorial conserva el borrador y evita despliegues", async () => {
    addReady("2026-10-01");
    const { daily, runBlogPython } = build({ inspect: async () => ({ publishable: false, checks: [{ group: "GEO", level: "error", message: "Especificación sin evidencia" }] }) });
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(0);
    expect(row("2026-10-01")).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(landings["l-2026-10-01"].status).toBe("DRAFT");
  });
  it("con la publicación apagada escribe las fechas sumadas desde el calendario, sin publicar", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "extra", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-20T00:00:00Z"), status: "PLANNED", attempts: 0, needsDeploy: false, revisionAttempts: 0, lastError: "", updatedAt: new Date(clock.getTime()) });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady(args[args.indexOf("--schedule-date") + 1]); });
    const { daily } = build({ runBlogPython });
    await daily.runDailyBlogCalendar();
    expect(rows).toHaveLength(1);
    expect(row("2026-10-20").status).toBe("READY");
    expect(deploys(runBlogPython)).toBe(0);
  });
  it("usa el mismo generador con el idioma reservado para otro cliente", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "localized", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-20T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "de" } });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady("2026-10-20"); });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls[0][0]).toEqual(expect.arrayContaining(["--language", "de", "--schedule-date", "2026-10-20"]));
    expect(row("2026-10-20").status).toBe("READY");
    expect(deploys(runBlogPython)).toBe(0);
  });
  it("pasa la intención del slot al generador y la conserva en la preparación", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    // El 21 es un día para elegir por paridad; el slot pide un artículo educativo.
    rows.push({ id: "explicit", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-21T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es", editorialIntent: "educational" } });
    let during: any;
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") { during = row("2026-10-21").preparation; addReady("2026-10-21"); } });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls[0][0]).toEqual(expect.arrayContaining(["--intent", "educational", "--schedule-date", "2026-10-21"]));
    expect(runBlogPython.mock.calls[0][0]).not.toContain("--comparison");
    expect(during).toMatchObject({ editorialIntent: "educational" });
  });
  it("sin intención explícita el generador recibe la de la paridad de la fecha", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "parity", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-21T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es" } });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady("2026-10-21"); });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls[0][0]).toEqual(expect.arrayContaining(["--intent", editorialIntentForDate("2026-10-21")]));
  });
  it("publica un artículo cuya intención explícita no coincide con la paridad de la fecha", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-21");
    const opposite = editorialIntentForDate("2026-10-21") === "decision" ? "educational" : "decision";
    landings["l-2026-10-21"].htmlContent = JSON.stringify({ h1: "Artículo", editorial_intent: opposite });
    row("2026-10-21").preparation = { editorialIntent: opposite };
    const { daily, runBlogPython } = build();
    await daily.publishBlogArticle(manualInput("2026-10-21"));
    // Publicado antes de fecha: el artículo pasa a hoy y conserva su intención.
    expect(rows.find((item) => item.landingId === "l-2026-10-21")).toMatchObject({ status: "PUBLISHED", preparation: { editorialIntent: opposite } });
    expect(deploys(runBlogPython)).toBe(1);
  });
  it("sin intención explícita sigue bloqueando un artículo que no coincide con la paridad", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-21");
    const opposite = editorialIntentForDate("2026-10-21") === "decision" ? "educational" : "decision";
    landings["l-2026-10-21"].htmlContent = JSON.stringify({ h1: "Artículo", editorial_intent: opposite });
    const { daily, runBlogPython } = build();
    await daily.publishBlogArticle(manualInput("2026-10-21"));
    expect(row("2026-10-21")).toMatchObject({ status: "FAILED", errorCode: "DATE_INCOMPATIBLE" });
    expect(deploys(runBlogPython)).toBe(0);
  });
  it("en modo balanced reserva los próximos 14 días con la intención repartida y alternada", async () => {
    clientPolicy = { blog: { intentMode: "balanced" } };
    const { daily } = build({ generationClients: new Set(["pcmidi"]) });
    await daily.runDailyBlogCalendar();
    const reserved = rows.filter((item) => item.status === "PLANNED").sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
    expect(reserved).toHaveLength(14);
    const intents = reserved.map((item) => item.preparation.editorialIntent);
    expect(intents.every((intent: string) => ["educational", "decision"].includes(intent))).toBe(true);
    expect(intents.filter((intent: string) => intent === "educational")).toHaveLength(7);
    for (let i = 1; i < intents.length; i++) expect(intents[i]).not.toBe(intents[i - 1]);
  });
  it("en modo parity las reservas automáticas no llevan intención explícita", async () => {
    const { daily } = build({ generationClients: new Set(["pcmidi"]) });
    await daily.runDailyBlogCalendar();
    const reserved = rows.filter((item) => item.status === "PLANNED");
    expect(reserved).toHaveLength(14);
    expect(reserved.every((item) => item.preparation === undefined)).toBe(true);
  });
  it("en modo balanced publicar antes de fecha intercambia fechas con el artículo de hoy", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    clientPolicy = { blog: { intentMode: "balanced" } };
    addReady("2026-10-01"); addReady("2026-10-04");
    const today = rows.find((item) => item.landingId === "l-2026-10-01")!;
    const { daily } = build();
    await daily.publishBlogArticle(manualInput("2026-10-04"));
    const early = rows.find((item) => item.landingId === "l-2026-10-04")!;
    expect(early).toMatchObject({ status: "PUBLISHED", scheduledDate: new Date("2026-10-01T00:00:00Z"), preparation: { editorialIntent: editorialIntentForDate("2026-10-04"), publishedEarly: { from: "2026-10-04", displacedTo: "2026-10-04" } } });
    expect(today).toMatchObject({ status: "READY", scheduledDate: new Date("2026-10-04T00:00:00Z"), preparation: { editorialIntent: editorialIntentForDate("2026-10-01") } });
    expect(rows.filter((item) => item.scheduledDate.toISOString().startsWith("2026-10-04"))).toHaveLength(1);
    expect(rows.some((item) => item.scheduledDate.getUTCFullYear() === 9999)).toBe(false);
  });
  it("en modo balanced publicar antes de fecha sin artículo de hoy deja un espacio con intención en la fecha liberada", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    clientPolicy = { blog: { intentMode: "balanced" } };
    addReady("2026-10-04");
    const { daily } = build();
    await daily.publishBlogArticle(manualInput("2026-10-04"));
    const freed = rows.find((item) => item.scheduledDate.toISOString().startsWith("2026-10-04"))!;
    expect(freed).toMatchObject({ status: "PLANNED", landingId: null, preparation: { phase: "WAITING", editorialIntent: expect.stringMatching(/^(educational|decision)$/) } });
  });
  it("pide comparativa solo en días para elegir que la reservaron", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "compare", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-21T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es", comparison: true } });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady("2026-10-21"); });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls[0][0]).toEqual(expect.arrayContaining(["--comparison", "--schedule-date", "2026-10-21"]));
  });
  it("pasa la consigna del equipo, sin comparativa, y la conserva en la preparación", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "brief", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-21T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es", comparison: true, brief: "Cómo elegir auriculares para mezclar" } });
    let preparationDuringRun: Row | undefined;
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") { preparationDuringRun = row("2026-10-21").preparation; addReady("2026-10-21"); } });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    const args = runBlogPython.mock.calls[0][0];
    expect(args[args.indexOf("--brief") + 1]).toBe("Cómo elegir auriculares para mezclar");
    expect(args).not.toContain("--comparison");
    expect(preparationDuringRun).toMatchObject({ brief: "Cómo elegir auriculares para mezclar", comparison: false });
  });
  it("pasa producto, exclusiones y rival del plan, y deja la comparativa para aprobar", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "plan", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-21T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es", comparison: false, brief: "Para producir en vivo", productId: "mp-1", excludedProductIds: ["mp-2", "mp-3"], competitor: "Akai MPK Mini", competitorNotes: "Sin soporte local" } });
    let preparationDuringRun: Row | undefined;
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") { preparationDuringRun = row("2026-10-21").preparation; addReady("2026-10-21"); } });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    const args = runBlogPython.mock.calls[0][0];
    expect(args).toContain("--comparison");
    expect(args[args.indexOf("--product-id") + 1]).toBe("mp-1");
    expect(args[args.indexOf("--exclude-products") + 1]).toBe("mp-2,mp-3");
    expect(args[args.indexOf("--competitor") + 1]).toBe("Akai MPK Mini");
    expect(args[args.indexOf("--competitor-notes") + 1]).toBe("Sin soporte local");
    expect(preparationDuringRun).toMatchObject({ productId: "mp-1", competitor: "Akai MPK Mini", comparison: true });
    expect(row("2026-10-21")).toMatchObject({ status: "READY", requiresApproval: true });
  });
  it("no aprueba sola una comparativa con rival elegido", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, autoApprove: true, publishTime: "23:59" });
    addReady("2026-10-21");
    Object.assign(row("2026-10-21"), { requiresApproval: true, preparation: { competitor: "Akai MPK Mini" } });
    const { daily } = build({ runBlogPython: vi.fn(), targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-21").requiresApproval).toBe(true);
  });
  it("no pide comparativa en días educativos", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "educational", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-20T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es", comparison: true } });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady("2026-10-20"); });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls[0][0]).not.toContain("--comparison");
  });
  it("pasa español explícito aunque el idioma predeterminado del cliente sea otro", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    rows.push({ id: "spanish", clientId: "c1", landingId: null, scheduledDate: new Date("2026-10-20T00:00:00Z"), status: "PLANNED", attempts: 0, updatedAt: clock, preparation: { language: "es" } });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady("2026-10-20"); });
    const { daily } = build({ runBlogPython, targetClientSlug: "any-brand" });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls[0][0]).toEqual(expect.arrayContaining(["--language", "es", "--schedule-date", "2026-10-20"]));
  });
  it("no publica el día de activación aunque haya un artículo listo", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, firstPublishDate: "2026-10-02", publishTime: "09:00" });
    addReady("2026-10-01");
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("READY");
    expect(deploys(runBlogPython)).toBe(0);
  });
  it("publica los fines de semana y respeta fechas omitidas", async () => {
    clock = new Date("2026-10-03T15:00:00Z");
    addReady("2026-10-03");
    const first = build(); await first.daily.runDailyBlogCalendar();
    expect(row("2026-10-03").status).toBe("PUBLISHED");
    clock = new Date("2026-10-04T15:00:00Z"); addReady("2026-10-04"); row("2026-10-04").status = "SKIPPED";
    const second = build(); await second.daily.runDailyBlogCalendar();
    expect(deploys(second.runBlogPython)).toBe(0);
    expect(row("2026-10-04").status).toBe("SKIPPED");
  });
  it("una revisión fallida mantiene la versión publicada y el cambio pendiente", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    addReady("2026-10-01");
    row("2026-10-01").status = "PUBLISHED"; row("2026-10-01").needsDeploy = true;
    const original = { h1: "Versión publicada", pending_revision: { content: { h1: "Versión editada" } } };
    landings["l-2026-10-01"].htmlContent = JSON.stringify(original);
    const { daily } = build({ runBlogPython: failingDeploy("caído") });
    await daily.runDailyBlogCalendar();
    expect(JSON.parse(landings["l-2026-10-01"].htmlContent)).toEqual(original);
    expect(row("2026-10-01")).toMatchObject({ status: "PUBLISHED", needsDeploy: true });
  });
  it("publica una vez y verifica la URL antes de informar éxito", async () => {
    addReady("2026-10-01");
    const { daily, runBlogPython, fetchUrl } = build();
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("PUBLISHED");
    expect(landings["l-2026-10-01"].status).toBe("PUBLISHED");
    expect(fetchUrl).toHaveBeenCalledWith(expect.stringContaining("https://blog.test/guias/controladores/art-2026-10-01/?revision="), expect.anything());
    expect(deploys(runBlogPython)).toBe(1);
  });

  it("no publica antes de la hora configurada", async () => {
    clock = new Date("2026-10-01T11:00:00Z"); // 08:00 ART
    addReady("2026-10-01");
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("READY");
    expect(deploys(runBlogPython)).toBe(0);
  });

  it("ejecuciones repetidas no vuelven a publicar", async () => {
    addReady("2026-10-01");
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    await daily.runDailyBlogCalendar();
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(1);
  });

  it("dos ejecuciones simultáneas publican una sola vez", async () => {
    addReady("2026-10-01");
    const { daily, runBlogPython } = build();
    await Promise.all([daily.runDailyBlogCalendar(), daily.runDailyBlogCalendar()]);
    expect(deploys(runBlogPython)).toBe(1);
  });

  it("dos instancias concurrentes (reinicio con proceso viejo) publican una sola vez", async () => {
    addReady("2026-10-01");
    const first = build();
    const second = build();
    await Promise.all([first.daily.runDailyBlogCalendar(), second.daily.runDailyBlogCalendar()]);
    expect(deploys(first.runBlogPython) + deploys(second.runBlogPython)).toBe(1);
  });

  it("si el despliegue falla queda FAILED y no se informa éxito", async () => {
    addReady("2026-10-01");
    const { daily } = build({ runBlogPython: failingDeploy("deploy caído") });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("FAILED");
    expect(row("2026-10-01").lastError).toContain("deploy caído");
    expect(row("2026-10-01").publishedAt).toBeUndefined();
  });

  it("si la URL pública no responde no queda PUBLISHED", async () => {
    addReady("2026-10-01");
    const { daily } = build({ fetchUrl: vi.fn(async () => ({ ok: false, status: 404 })) });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("FAILED");
    expect(row("2026-10-01").lastError).toContain("404");
  });

  it("reintenta una falla y se detiene a los 3 intentos", async () => {
    addReady("2026-10-01");
    const runBlogPython = failingDeploy("x");
    const { daily } = build({ runBlogPython });
    for (let i = 0; i < 6; i += 1) await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").attempts).toBe(3);
    expect(deploys(runBlogPython)).toBe(3);
  });

  it("tras un reinicio, una publicación interrumpida se marca fallida y se reintenta", async () => {
    addReady("2026-10-01");
    Object.assign(row("2026-10-01"), { status: "PUBLISHING", attempts: 1, updatedAt: new Date(clock.getTime() - 20 * 60_000) });
    const { daily } = build();
    await daily.runDailyBlogCalendar();
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("PUBLISHED");
    expect(row("2026-10-01").attempts).toBe(2);
  });

  it("una publicación en curso reciente no se pisa", async () => {
    addReady("2026-10-01");
    row("2026-10-01").status = "PUBLISHING";
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(0);
    expect(row("2026-10-01").status).toBe("PUBLISHING");
  });

  it("un borrador del análisis requiere aprobación aunque la publicación automática esté activada", async () => {
    addReady("2026-10-01");
    Object.assign(row("2026-10-01"), { analysisRunId: "analysis", requiresApproval: true });
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(0);
    expect(row("2026-10-01").status).toBe("READY");
    row("2026-10-01").requiresApproval = false;
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("PUBLISHED");
  });

  it("mantiene 14 días reservados y omite fechas pasadas sin publicar", async () => {
    addReady("2026-09-29");
    const { daily } = build();
    await daily.runDailyBlogCalendar();
    expect(row("2026-09-29").status).toBe("SKIPPED");
    for (let day = 2; day <= 15; day += 1) expect(row(`2026-10-${String(day).padStart(2, "0")}`)).toBeDefined();
  });

  it("repone un artículo por ejecución en el primer hueco", async () => {
    const runBlogPython = vi.fn(async (args: string[]) => {
      if (args[0] === "generate") addReady(args[args.indexOf("--schedule-date") + 1]);
      return "ok";
    });
    const { daily } = build({ runBlogPython });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-02").status).toBe("READY");
    expect(runBlogPython.mock.calls.filter(([args]) => args[0] === "generate")).toHaveLength(1);
  });

  it("una falla de generación se registra en la fecha y se reintenta", async () => {
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") throw new Error("LLM caído"); return "ok"; });
    const { daily } = build({ runBlogPython });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-02").status).toBe("FAILED");
    expect(row("2026-10-02").lastError).toContain("LLM caído");
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-02").attempts).toBe(2);
  });

  it("apagada: no genera ni publica, pero despliega ediciones de artículos publicados", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false, publishTime: "09:00" });
    addReady("2026-10-01");
    Object.assign(row("2026-10-01"), { status: "PUBLISHED", needsDeploy: true });
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(1);
    expect(row("2026-10-01").needsDeploy).toBe(false);
    expect(runBlogPython.mock.calls.some(([args]) => args[0] === "generate")).toBe(false);
  });

  it("una edición cuyo despliegue falla conserva needsDeploy y registra el error", async () => {
    addReady("2026-10-01");
    Object.assign(row("2026-10-01"), { status: "PUBLISHED", needsDeploy: true });
    const { daily } = build({ runBlogPython: failingDeploy("falló") });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").needsDeploy).toBe(true);
    expect(row("2026-10-01").lastError).toContain("falló");
  });
});

describe("traducciones y borrado", () => {
  it("publica las traducciones en borrador junto con su original", async () => {
    addReady("2026-10-01");
    landings.tr = { id: "tr", slug: "art-en", status: "DRAFT", htmlContent: JSON.stringify({ h1: "Article", language: "en", translation_of: "l-2026-10-01" }) };
    landings.other = { id: "other", slug: "otro", status: "DRAFT", htmlContent: JSON.stringify({ h1: "Otro" }) };
    const { daily } = build();
    await daily.runDailyBlogCalendar();
    expect(landings["l-2026-10-01"].status).toBe("PUBLISHED");
    expect(landings.tr.status).toBe("PUBLISHED");
    expect(landings.other.status).toBe("DRAFT");
  });
  it("si falla la publicación las traducciones vuelven a borrador", async () => {
    addReady("2026-10-01");
    landings.tr = { id: "tr", slug: "art-en", status: "DRAFT", htmlContent: JSON.stringify({ h1: "Article", language: "en", translation_of: "l-2026-10-01" }) };
    const { daily } = build({ runBlogPython: failingDeploy("caído") });
    await daily.runDailyBlogCalendar();
    expect(row("2026-10-01").status).toBe("FAILED");
    expect(landings.tr.status).toBe("DRAFT");
  });
  it("traduce el pedido pendiente y pide redesplegar si el original está publicado", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    landings.orig = { id: "orig", slug: "guia", status: "PUBLISHED", htmlContent: JSON.stringify({ h1: "Guía" }) };
    settings["blog_translation_queue:c1"] = JSON.stringify([{ landingId: "orig", language: "en", requestedAt: "x", attempts: 0 }]);
    const { daily, runBlogPython } = build();
    await daily.runDailyBlogCalendar();
    expect(runBlogPython).toHaveBeenCalledWith(["translate", "--landing-id", "orig", "--language", "en"], "c1", 300_000);
    expect(JSON.parse(settings["blog_translation_queue:c1"])).toEqual([]);
    expect(settings["blog_redeploy_pending:c1"]).toBeTruthy();
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(1);
    expect(settings["blog_redeploy_pending:c1"]).toBeUndefined();
  });
  it("un fallo de traducción se reintenta una vez y después queda informado", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    landings.orig = { id: "orig", slug: "guia", status: "DRAFT", htmlContent: JSON.stringify({ h1: "Guía" }) };
    settings["blog_translation_queue:c1"] = JSON.stringify([{ landingId: "orig", language: "de", requestedAt: "x", attempts: 0 }]);
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "translate") throw new Error("sin cupo"); return "ok"; });
    const { daily } = build({ runBlogPython });
    await daily.runDailyBlogCalendar();
    expect(JSON.parse(settings["blog_translation_queue:c1"])[0]).toMatchObject({ attempts: 1 });
    await daily.runDailyBlogCalendar();
    expect(JSON.parse(settings["blog_translation_queue:c1"])[0]).toMatchObject({ attempts: 2, error: expect.stringContaining("sin cupo") });
    await daily.runDailyBlogCalendar();
    expect(runBlogPython.mock.calls.filter(([args]) => args[0] === "translate")).toHaveLength(2);
    expect(settings["blog_redeploy_pending:c1"]).toBeUndefined();
  });
  it("redespliega el blog tras borrar un artículo publicado y espera si falla", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false });
    settings["blog_redeploy_pending:c1"] = "2026-10-01T14:00:00Z";
    const runBlogPython = failingDeploy("vercel caído");
    const { daily } = build({ runBlogPython });
    await daily.runDailyBlogCalendar();
    await daily.runDailyBlogCalendar();
    expect(deploys(runBlogPython)).toBe(1);
    expect(settings["blog_redeploy_pending:c1"]).toBe("2026-10-01T14:00:00Z");
  });
});

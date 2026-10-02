import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-ignore módulo .mjs sin tipos
import { createBlogDaily } from "../../scripts/blog-daily.mjs";
import { editorialIntentForDate } from "./blog-quality.mjs";

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "landing") return cond?.isNot === null ? row.landingId != null : true;
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(value);
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

function withLanding(item: Row, include: any) {
  return include ? { ...item, landing: item.landingId ? landings[item.landingId] : null } : item;
}

const prisma = {
  client: { findUnique: async () => ({ id: "c1", active: true, blogBaseUrl: "https://blog.test" }) },
  appSetting: { findUnique: async ({ where }: any) => (settings[where.key] ? { value: settings[where.key] } : null) },
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

beforeEach(() => {
  clock = new Date("2026-10-01T15:00:00Z"); // 12:00 en Buenos Aires
  rows = [];
  landings = {};
  seq = 1;
  settings = { "blog_daily_schedule:c1": JSON.stringify({ enabled: true, reviewedBatchAt: "2026-09-30T10:00:00Z", publishTime: "09:00" }) };
});

describe("rutina diaria del blog", () => {
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
  it("prepara 14 días con la publicación apagada", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: false, preparing: true, batchStart: "2026-10-02" });
    const runBlogPython = vi.fn(async (args: string[]) => { if (args[0] === "generate") addReady(args[args.indexOf("--schedule-date") + 1]); });
    const { daily } = build({ runBlogPython });
    await daily.runDailyBlogCalendar();
    expect(rows).toHaveLength(14);
    expect(row("2026-10-02").status).toBe("READY");
    expect(deploys(runBlogPython)).toBe(0);
  });
  it("no publica el día de activación aunque haya un artículo listo", async () => {
    settings["blog_daily_schedule:c1"] = JSON.stringify({ enabled: true, reviewedBatchAt: "2026-10-01T10:00:00Z", firstPublishDate: "2026-10-02", publishTime: "09:00" });
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

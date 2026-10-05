import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MARKET, type BusinessProfileData, type ContentOpportunity } from "./business-analysis";
import { defaultDraft } from "./onboarding";
vi.mock("./business-analysis-service", async () => ({
  ...await vi.importActual<any>("./business-analysis-service"),
  ensureBusinessProfile: async (db: any) => db.profile,
  saveAnalyzedProfile: async (db: any, _client: any, draft: any) => ({ ...db.profile.data, draft }),
}));
import { processBusinessAnalysis, reserveAnalysisWeek } from "./business-analysis-worker";
const topics: ContentOpportunity[] = ["primer instrumento", "práctica en casa", "lectura musical", "técnica de manos", "rutina semanal", "cuidado del piano", "clases para adultos"].map(keyword => ({ keyword, title: `Guía de ${keyword}`, category: "Clases", reason: "Orientación", sourceUrls: [], interpretation: true }));
function database() {
  const data: BusinessProfileData = { draft: { ...defaultDraft("Clases Norte"), description: "Enseñanza de piano", offer: "Clases de piano" }, market: DEFAULT_MARKET, priorities: ["Clases"], exclusions: [], differentiators: [], manualFields: [] };
  const profile = { data };
  const client = { id: "a", name: "Clases Norte" };
  const run: any = { id: "run", clientId: "a", status: "QUEUED", attempts: 0, sourceUrl: "", startedAt: new Date("2026-09-30T15:00:00Z"), checkpoint: {}, result: {}, errors: [], leaseToken: null };
  const slots: any[] = []; const landings: any[] = [];
  function matches(row: any, where: any): boolean {
    return Object.entries(where || {}).every(([key, value]: any) => {
      if (key === "OR") return value.some((clause: any) => matches(row, clause));
      if (value instanceof Date) return row[key]?.getTime() === value.getTime();
      if (value && typeof value === "object") {
        if (Object.hasOwn(value, "not")) return row[key] !== value.not;
        if (value.in) return value.in.includes(row[key]);
        if (value.lt !== undefined) return row[key] < value.lt;
        if (value.gt !== undefined) return row[key] > value.gt;
      }
      return row[key] === value;
    });
  }
  const apply = (row: any, input: any) => Object.entries(input).forEach(([key, value]: any) => { row[key] = value?.increment ? (row[key] || 0) + value.increment : value; });
  const db: any = {
    profile,
    client: { findUniqueOrThrow: async () => client },
    businessProfile: { findUniqueOrThrow: async () => profile, updateMany: vi.fn(async () => ({ count: 1 })) },
    businessAnalysisRun: { findUniqueOrThrow: async () => run, updateMany: vi.fn(async ({ where, data }: any) => { if (!matches(run, where)) return { count: 0 }; apply(run, data); return { count: 1 }; }) },
    businessCompetitor: { findMany: async () => [] },
    landingCategory: { findFirst: async () => ({ key: "clases", name: "Clases" }) },
    landing: { findMany: async ({ where }: any) => landings.filter(row => matches(row, where)) },
    blogPublication: {
      findUnique: async ({ where }: any) => slots.find(row => matches(row, where.clientId_scheduledDate)),
      create: vi.fn(async ({ data }: any) => { const slot = { id: `s${slots.length}`, attempts: 0, landingId: null, ...data }; slots.push(slot); return slot; }),
      findMany: async ({ where }: any) => slots.filter(row => matches(row, where)),
      update: async ({ where, data }: any) => { const slot = slots.find(row => row.id === where.id); apply(slot, data); return slot; },
      updateMany: async ({ where, data }: any) => { const rows = slots.filter(row => matches(row, where)); rows.forEach(row => apply(row, data)); return { count: rows.length }; },
      count: async ({ where }: any) => slots.filter(row => matches(row, where)).length,
    },
    $queryRaw: async () => [],
  };
  db.$transaction = async (callback: any) => callback(db);
  return { db, run, client, slots, landings, profile: data };
}
describe("cola y reservas del análisis", () => {
  it("conserva fechas ocupadas y aísla reservas de otros clientes", async () => {
    const { db, run, slots, profile } = database();
    slots.push({ id: "occupied", clientId: "a", scheduledDate: new Date("2026-10-01T00:00:00Z"), landingId: "old", status: "READY" }, { id: "other", clientId: "b", scheduledDate: new Date("2026-10-02T00:00:00Z"), landingId: "other-article" });
    await reserveAnalysisWeek(db, run, profile, topics);
    await reserveAnalysisWeek(db, run, profile, topics);
    expect(db.blogPublication.create).toHaveBeenCalledTimes(6);
    expect(slots.find(s => s.id === "occupied")?.landingId).toBe("old");
    expect(slots.filter(s => s.analysisRunId === "run").every(s => s.requiresApproval && s.clientId === "a")).toBe(true);
    expect(slots.filter(s => s.clientId === "a").map(s => s.scheduledDate.toISOString().slice(0, 10)).sort()).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
  });
  it("completa siete borradores sin competidores y retoma checkpoints sin duplicar", async () => {
    const { db, run, slots, landings } = database();
    const generate = vi.fn(async (_db, client, _profile, topic, slotId) => {
      const id = `article-${slotId}`;
      landings.push({ id, clientId: client.id, keyword: topic.keyword, status: "DRAFT" });
      Object.assign(slots.find(s => s.id === slotId), { landingId: id, status: "READY" });
      return id;
    });
    const discover = vi.fn(async () => []), propose = vi.fn(async () => topics);
    const deps = { discover, topics: propose, generate };
    await processBusinessAnalysis(db, run.id, deps);
    expect(run.status).toBe("COMPLETED"); expect(run.result.articlesCreated).toBe(7); expect(landings).toHaveLength(7);
    run.status = "QUEUED"; run.attempts = 0;
    await processBusinessAnalysis(db, run.id, deps);
    expect(landings).toHaveLength(7); expect(generate).toHaveBeenCalledTimes(7); expect(discover).toHaveBeenCalledTimes(1);
  });
  it("registra días pendientes ante fallos de IA y limita cada tarea a tres intentos", async () => {
    const { db, run, slots } = database();
    const propose = vi.fn(async () => { throw new Error("IA inaccesible"); }); const generate = vi.fn();
    await processBusinessAnalysis(db, run.id, { discover: async () => [], topics: propose, generate });
    expect(propose).toHaveBeenCalledTimes(3); expect(generate).not.toHaveBeenCalled();
    expect(run.status).toBe("PARTIAL"); expect(slots).toHaveLength(7); expect(slots.every(s => s.status === "FAILED" && !s.landingId)).toBe(true);
  });
  it("un sitio caído conserva el último perfil y termina tras tres corridas", async () => {
    const { db, run, profile } = database(); run.sourceUrl = "https://shop.example";
    const analyze = vi.fn(async () => { throw new Error("Sitio inaccesible"); });
    for (let n = 0; n < 4; n++) await processBusinessAnalysis(db, run.id, { analyze });
    expect(run.status).toBe("FAILED"); expect(analyze).toHaveBeenCalledTimes(3); expect(profile.draft.description).toBe("Enseñanza de piano");
  });
});

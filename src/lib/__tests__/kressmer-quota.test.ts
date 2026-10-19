import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: {
  client: { findUnique: vi.fn(), update: vi.fn() },
  monitoredSource: { findMany: vi.fn(), update: vi.fn() },
  opportunity: { findMany: vi.fn() },
} }));
vi.mock("../db", () => ({ prisma: db }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), writeFile: vi.fn(), appendFile: vi.fn(), open: vi.fn(), readFile: vi.fn(), stat: vi.fn(), unlink: vi.fn() }));
// @ts-ignore -- exercise the operational TypeScript ESM entrypoint.
import { pipelineLockPath, runClient } from "../../../scripts/daily-opportunity-quota.mts";
import { KRESSMER_QUERIES } from "../kressmer-radar";

const now = new Date("2026-10-19T18:00:00Z");
let rows: any[];
let state: any;
const client = () => ({ id: "k", slug: "kressmer", name: "Kressmer", dailyOpportunityTarget: 20, domainKeywords: "[]", opportunitySearchState: state });
const sources = KRESSMER_QUERIES.map((item, i) => ({ id: `s${i}`, label: item.query, channel: "youtube", query: item.query, account: "test", limit: 40 }));
const answer = "For learning, a digital piano with weighted keys can help.";
function opportunity(i: number, ready = false) {
  return { id: `o${i}`, contextAssessment: { kressmerRadar: { version: 1, language: "en", publishedAt: "2026-10-18T12:00:00Z", commentKey: `v:c${i}` } }, responses: ready ? [{ draftText: answer, editedText: "" }] : [] };
}
const result = (payload: unknown, code = 0) => ({ code, stdout: JSON.stringify(payload), stderr: "", output: JSON.stringify(payload), timedOut: false });
describe("Kressmer daily pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks(); rows = []; state = {};
    db.client.findUnique.mockResolvedValue({ slug: "kressmer" });
    db.client.update.mockImplementation(async ({ data }) => { state = data.opportunitySearchState; return {}; });
    db.monitoredSource.findMany.mockResolvedValue(sources);
    db.monitoredSource.update.mockResolvedValue({});
    db.opportunity.findMany.mockImplementation(async () => rows);
  });
  afterEach(() => vi.useRealTimers());

  it("bounds attempts, rotates ES/EN/DE and checkpoints for the next invocation", async () => {
    const execute = vi.fn(async (_cmd, args) => {
      if (args[0] === "agents/social-listen.py") {
        const language = args[args.indexOf("--language") + 1];
        const text = ({ es: "¿Qué piano digital recomiendan para aprender?", en: "Which digital piano should I buy?", de: "Welches Digitalpiano kann ich kaufen?" } as Record<string, string>)[language];
        return result({ rows: [{ channel: "youtube", sourceType: "youtube_comment", sourceText: text, captured_at_utc: now.toISOString(), publishedTime: "2 days ago", sourceUrl: `https://youtube.com/watch?v=v&lc=Ugx${execute.mock.calls.length}` }], summary: { items_read: 1 } });
      }
      if (args.includes("scripts/import-opportunities.mts")) rows.push(opportunity(rows.length));
      return result({});
    });
    const first = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 3, "test", 1, execute, false);
    expect(first.newOpportunities).toBe(3);
    expect(first.readyResponses).toBe(0);
    expect(first.complete).toBe(false);
    expect(state.cursor).toBe(3);
    const listenCalls = execute.mock.calls.filter(call => call[1][0] === "agents/social-listen.py");
    expect(listenCalls.map(call => call[1][call[1].indexOf("--language") + 1])).toEqual(["es", "en", "de"]);
    expect(db.monitoredSource.findMany.mock.calls[0][0].where.channel).toBe("youtube");
    await runClient(client(), new Date("2026-10-19T03:00:00Z"), 1, "restart", 1, execute, false);
    const last = execute.mock.calls.filter(call => call[1][0] === "agents/social-listen.py").at(-1)!;
    expect(last[1]).toContain(KRESSMER_QUERIES[3].query);
  });
  it("keeps searching past three rounds until today's target of 20 is reached", async () => {
    let comment = 0;
    const execute = vi.fn(async (_cmd, args) => {
      if (args[0] === "agents/social-listen.py") {
        comment += 1;
        return result({ rows: [{ channel: "youtube", sourceType: "youtube_comment", sourceText: "Which digital piano should I buy for learning?", captured_at_utc: now.toISOString(), publishedTime: "2 days ago", sourceUrl: `https://youtube.com/watch?v=v&lc=Ugx${comment}` }], summary: { items_read: 30 } });
      }
      if (args.includes("scripts/import-opportunities.mts")) rows.push(opportunity(rows.length));
      return result({});
    });
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 60, "until-20", 1, execute, false);
    expect(report.newOpportunities).toBe(20);
    expect(report.stopReason).toBe("target_reached");
    const listens = execute.mock.calls.filter(call => call[1][0] === "agents/social-listen.py");
    expect(listens).toHaveLength(20);
    expect(listens[0][1]).toEqual(expect.arrayContaining(["--youtube-search-mode", "popular", "--youtube-videos", "6", "--youtube-comment-pages", "3"]));
    expect(new Set(listens.map(call => call[1][call[1].indexOf("--query") + 1])).size).toBe(20);
  });
  it("counts an English comment found by a Spanish search: any of ES/EN/DE is valid", async () => {
    const execute = vi.fn(async (_cmd: string, args: string[]) => {
      if (args[0] === "agents/social-listen.py") return result({ rows: [{ channel: "youtube", sourceType: "youtube_comment", requestedLanguage: "es", sourceText: "Which digital piano should I buy for my daughter?", captured_at_utc: now.toISOString(), publishedTime: "2 days ago", sourceUrl: "https://youtube.com/watch?v=v&lc=UgxEnglish" }], summary: { items_read: 1 } });
      if (args.includes("scripts/import-opportunities.mts")) rows.push(opportunity(rows.length));
      return result({});
    });
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 1, "mixed", 1, execute, false);
    expect(report.discardReasons).toEqual({});
    expect(report.newOpportunities).toBe(1);
  });
  it("stops after three rounds that read nothing so a broken browser is retried later", async () => {
    const execute = vi.fn(async (_cmd: string, _args: string[]) => result({ rows: [], summary: { items_read: 0 } }));
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 60, "empty", 1, execute, false);
    expect(execute.mock.calls.filter(call => call[1][0] === "agents/social-listen.py")).toHaveLength(3);
    expect(report.stopReason).toBe("youtube_unreadable");
    expect(report.missingOpportunities).toBe(20);
  });
  it("hands over to the next trigger when the run's time budget is used up", async () => {
    const execute = vi.fn(async (_cmd, args) => {
      if (args[0] === "agents/social-listen.py") vi.setSystemTime(Date.now() + 10 * 60_000);
      return result({ rows: [], summary: { items_read: 25 } });
    });
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 60, "budget", 1, execute, false);
    expect(report.stopReason).toBe("time_budget");
    expect(execute.mock.calls.filter(call => call[1][0] === "agents/social-listen.py")).toHaveLength(3);
    expect(state.cursor).toBe(3);
  });
  it("stops searching at 20 but retries missing responses from today's cohort", async () => {
    rows = Array.from({ length: 20 }, (_, i) => opportunity(i, i < 18));
    const execute = vi.fn(async () => { rows.forEach(row => { row.responses = [{ draftText: answer, editedText: "" }]; }); return result({}); });
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 3, "ready", 1, execute, false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]).toBeDefined();
    expect(report.readyResponses).toBe(20);
    expect(report.complete).toBe(true);
  });
  it("records a YouTube failure and preserves the deficit", async () => {
    const execute = vi.fn(async () => ({ ...result({}, 1), output: "YouTube unavailable", stderr: "offline" }));
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 1, "offline", 1, execute, false);
    expect(report.complete).toBe(false);
    expect(report.missingOpportunities).toBe(20);
    expect(report.blockedChannels).toEqual(["youtube"]);
  });
  it("dry-run previews discovery without importing, drafting or changing database state", async () => {
    const execute = vi.fn(async () => result({ rows: [{ sourceUrl: "https://youtube.com/watch?v=v&lc=UgxOne" }], summary: { items_read: 1 } }));
    const report = await runClient(client(), new Date("2026-10-19T03:00:00Z"), 1, "preview", 1, execute, true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(db.client.update).not.toHaveBeenCalled();
    expect(db.monitoredSource.update).not.toHaveBeenCalled();
    expect(report.newOpportunities).toBe(0);
  });
});

describe("pipeline lock scope", () => {
  it("gives Kressmer its own lock and keeps the other clients on the shared one", () => {
    expect(pipelineLockPath("kressmer", "/w")).toMatch(/opportunity-pipeline-kressmer\.lock$/);
    expect(pipelineLockPath("pcmidi", "/w")).toMatch(/opportunity-pipeline\.lock$/);
    expect(pipelineLockPath("", "/w")).toMatch(/opportunity-pipeline\.lock$/);
  });
});

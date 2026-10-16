import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const model = vi.hoisted(() => ({ version: "v1", duringGeneration: (() => {}) as () => void }));
vi.mock("../cm-version", () => ({ loadCMVersion: vi.fn(async () => model.version) }));
vi.mock("../ai-draft-generator", () => ({
  generateAICopilotDraft: vi.fn(async () => { model.duringGeneration(); return { draftText: "Propuesta actualizada", riskNotes: "" }; }),
  shortenCopilotText: (text: string) => text,
}));
vi.mock("../draft-generator", () => ({ generateLocalDrafts: vi.fn(() => [{ variantType: "SHORT", draftText: "Plantilla segura", riskNotes: "" }]) }));
vi.mock("../draft-output", () => ({ ensureRequiredBrandMention: (text: string) => text, sanitizeCopilotDraft: (text: string) => text }));
vi.mock("../client-context", () => ({ loadClientContext: vi.fn(async () => ({
  client: { id: "client", slug: "pcmidi" }, brand: { id: "brand", clientId: "client" },
  personas: [{ id: "persona", name: "Técnico", clientId: "client" }], catalogProducts: [], services: [], catalogRules: [], detectedProduct: null,
})) }));
vi.mock("../knowledge", () => ({ loadRelevantKnowledge: vi.fn(async () => ({ knowledge: [], objections: [] })) }));
vi.mock("../prompts", () => ({ loadActivePrompt: vi.fn(async () => "Prompt actual") }));
vi.mock("../client-memory", () => ({ getAcceptedExamples: vi.fn(async () => []), getClientMemories: vi.fn(async () => []) }));
vi.mock("../observed-profiles", () => ({ loadObservedProfileContext: vi.fn(async () => null) }));
vi.mock("../competitor-evidence", () => ({ loadRelevantCompetitorEvidence: vi.fn(async () => []) }));
vi.mock("../guardrails", () => ({ validateClientScopedActors: () => ({ ok: true }), detectCrossClientTerms: vi.fn(async () => []) }));

import { cmCanRetry, cmDay, cmState, loadCMCoverage, refreshCMOpportunity, runCMMaintenance } from "../cm-maintenance";
import { cmCoverageStatus, cmStamp } from "../cm-freshness";
import { generateAICopilotDraft } from "../ai-draft-generator";

function fixture() {
  const response = { id: "old", personaId: "persona", brandId: "brand", draftText: "Vieja", editedText: "", approvedBy: "", acceptedAsCorrectAt: null,
    isPrimary: true, chatHistory: [] as unknown[], evidence: [] as unknown[], publishingLog: null, createdAt: new Date(0), updatedAt: new Date(0) };
  const opportunity = { id: "op", clientId: "client", sourceText: "¿Tiene garantía?", sourceTitle: "Teclado", channelId: "youtube", channel: { name: "YouTube" },
    detectedIntent: "WARRANTY_QUESTION", detectedProductId: null, contextAssessment: {}, status: "DRAFTED", priority: "HIGH", createdAt: new Date(0), updatedAt: new Date(0), responses: [response] };
  let lease = { lockedBy: "", leaseUntil: new Date(), status: "QUEUED" };
  const settings = new Map<string, string>();
  const db = {
    opportunity: {
      findUniqueOrThrow: vi.fn(async () => structuredClone(opportunity)), findMany: vi.fn(async () => [structuredClone(opportunity)]),
      update: vi.fn(async ({ data }) => Object.assign(opportunity, data)),
    },
    response: {
      create: vi.fn(async ({ data }) => { opportunity.responses.unshift({ ...response, ...data, id: "new" }); }),
      update: vi.fn(async ({ where, data }) => Object.assign(opportunity.responses.find((row) => row.id === where.id)!, data)),
      updateMany: vi.fn(async ({ data }) => opportunity.responses.forEach((row) => Object.assign(row, data))),
    },
    draftJob: {
      upsert: vi.fn(async () => {}), findUnique: vi.fn(async () => lease),
      updateMany: vi.fn(async ({ data }) => { lease = { ...lease, ...data }; return { count: 1 }; }),
    },
    appSetting: {
      findUnique: vi.fn(async ({ where }) => settings.has(where.key) ? { value: settings.get(where.key) } : null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async ({ create, update }) => settings.set(create.key, settings.has(create.key) ? update.value : create.value)),
    },
    client: { findMany: vi.fn(async () => [{ id: "client", slug: "pcmidi" }]) },
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  return { db: db as unknown as PrismaClient, mock: db, opportunity, response, settings };
}

describe("actualización automática del CM", () => {
  beforeEach(() => { vi.clearAllMocks(); model.version = "v1"; model.duringGeneration = () => {}; });
  it("genera faltantes y registra la versión sin borrar historial", async () => {
    const f = fixture(); f.opportunity.responses = [];
    expect(await refreshCMOpportunity(f.db, "client", "op", "owner")).toBe("generated");
    expect(f.opportunity.responses).toHaveLength(1);
    expect(cmCoverageStatus(f.opportunity.responses, "v1", f.opportunity)).toBe("fresh");
  });
  it("actualiza una propuesta vieja y conserva su versión anterior", async () => {
    const f = fixture();
    expect(await refreshCMOpportunity(f.db, "client", "op", "owner")).toBe("generated");
    expect(f.opportunity.responses).toHaveLength(2);
    expect(f.response).toMatchObject({ draftText: "Vieja", isPrimary: false });
  });
  it("conserva edición, aprobación, primaria y chat y crea una propuesta para revisar", async () => {
    const f = fixture(); f.response.editedText = "Edición de Fede"; f.response.approvedBy = "Fede";
    f.response.chatHistory = [{ sender: "user", text: "No inventes stock" }]; f.opportunity.status = "APPROVED";
    expect(await refreshCMOpportunity(f.db, "client", "op", "owner")).toBe("review");
    expect(f.response).toMatchObject({ editedText: "Edición de Fede", approvedBy: "Fede", isPrimary: true });
    expect(f.opportunity.status).toBe("APPROVED");
    expect(cmCoverageStatus(f.opportunity.responses, "v1", f.opportunity)).toBe("review");
    expect(vi.mocked(generateAICopilotDraft).mock.calls[0][0].refinementGuidance).toContain("No inventes stock");
  });
  it("no genera dos veces para la misma versión", async () => {
    const f = fixture(); f.response.evidence = [cmStamp("v1", f.opportunity, "ai")];
    expect(await refreshCMOpportunity(f.db, "client", "op")).toBe("skipped");
    expect(generateAICopilotDraft).not.toHaveBeenCalled();
  });
  it("no genera cuando otro proceso tiene la oportunidad reservada", async () => {
    const f = fixture(); f.mock.draftJob.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await refreshCMOpportunity(f.db, "client", "op")).toBe("skipped");
    expect(generateAICopilotDraft).not.toHaveBeenCalled();
    expect(f.mock.response.create).not.toHaveBeenCalled();
  });
  it("descarta un resultado si el prompt cambia en medio de la generación", async () => {
    const f = fixture(); model.duringGeneration = () => { model.version = "v2"; };
    expect(await refreshCMOpportunity(f.db, "client", "op")).toBe("changed");
    expect(f.mock.response.create).not.toHaveBeenCalled();
    expect(f.opportunity.responses).toHaveLength(1);
  });
  it("no pisa una corrección concurrente del operador", async () => {
    const f = fixture(); model.duringGeneration = () => { f.response.editedText = "Corrección mientras la IA trabaja"; };
    expect(await refreshCMOpportunity(f.db, "client", "op")).toBe("changed");
    expect(f.mock.response.create).not.toHaveBeenCalled();
    expect(f.response.editedText).toContain("Corrección");
  });
  it("rechaza oportunidades de otro cliente y las ya publicadas", async () => {
    const f = fixture();
    expect(await refreshCMOpportunity(f.db, "another", "op")).toBe("skipped");
    f.opportunity.status = "PUBLISHED";
    expect(await refreshCMOpportunity(f.db, "client", "op")).toBe("skipped");
    expect(generateAICopilotDraft).not.toHaveBeenCalled();
  });
  it("registra errores y respeta la espera y el límite de reintentos por versión y día", async () => {
    const f = fixture(); vi.mocked(generateAICopilotDraft).mockRejectedValueOnce(new Error("Proveedor caído"));
    await expect(refreshCMOpportunity(f.db, "client", "op")).rejects.toThrow("Proveedor caído");
    const state = cmState(f.settings.get("cm.maintenance.error.client.op"))!;
    expect(state.attempts).toBe(1);
    expect(cmCanRetry(state, "v1", state.input)).toBe(false);
    expect(cmCanRetry(state, "v2", state.input)).toBe(true);
    expect(cmCanRetry({ ...state, attempts: 3, retryAt: new Date(0).toISOString() }, "v1", state.input)).toBe(false);
    expect(cmCanRetry({ ...state, day: "2000-01-01" }, "v1", state.input)).toBe(true);
    expect(cmDay(new Date("2026-10-14T02:00:00Z"))).toBe("2026-10-13");
  });
  it("la simulación no genera, no consume presupuesto ni cambia datos", async () => {
    const f = fixture();
    const results = await runCMMaintenance(f.db, { limit: 10, dailyLimit: 200, dryRun: true });
    expect(results[0].outcomes).toHaveLength(1);
    expect(generateAICopilotDraft).not.toHaveBeenCalled();
    expect(f.mock.appSetting.upsert).not.toHaveBeenCalled();
    expect(f.mock.draftJob.upsert).not.toHaveBeenCalled();
  });
  it("incluye toda la bandeja, sin el límite de 60 tarjetas, y respeta el presupuesto diario", async () => {
    const f = fixture();
    f.mock.opportunity.findMany.mockResolvedValue(Array.from({ length: 120 }, (_, i) => ({ ...f.opportunity, id: String(i), responses: [] })));
    expect((await loadCMCoverage(f.db, "client")).counts.missing).toBe(120);
    f.settings.set(`cm.maintenance.budget.client.${cmDay()}`, "200");
    const results = await runCMMaintenance(f.db, { limit: 10, dailyLimit: 200 });
    expect(results[0].outcomes).toHaveLength(0);
    expect(generateAICopilotDraft).not.toHaveBeenCalled();
  });
});

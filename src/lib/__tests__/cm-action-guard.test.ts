import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
vi.mock("../cm-version", () => ({ loadCMVersion: vi.fn(async () => "v1") }));
import { loadCMVersion } from "../cm-version";
import { cmStamp } from "../cm-freshness";
import { assertCurrentCMResponse, CMStaleResponseError } from "../cm-action-guard";

function fixture() {
  const opportunity = { sourceText: "Consulta", sourceTitle: "Video", channelId: "yt", detectedIntent: "TECHNICAL_QUESTION", detectedProductId: "product", detectedBrandId: "brand", contextAssessment: {}, channel: { name: "YouTube" } };
  const row = { opportunity, evidence: [cmStamp("v1", opportunity, "ai")], approvedBy: "", editedText: "", acceptedAsCorrectAt: null as Date | null };
  const findFirst = vi.fn(async () => row);
  return { row, findFirst, db: { response: { findFirst } } as unknown as PrismaClient };
}
beforeEach(() => { vi.mocked(loadCMVersion).mockReset().mockResolvedValue("v1"); });
describe("vigencia exacta al aplicar o publicar CM", () => {
  it("acepta la versión vigente consultada directamente", async () => {
    const f = fixture(); await expect(assertCurrentCMResponse(f.db, "tenant", "response", "op")).resolves.toBeUndefined();
    expect(f.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "response", opportunityId: "op", opportunity: { clientId: "tenant" } } }));
  });
  it("rechaza una respuesta de otro cliente", async () => {
    const f = fixture(); f.findFirst.mockResolvedValue(null as never);
    await expect(assertCurrentCMResponse(f.db, "tenant", "response")).rejects.toThrow("no corresponde");
    expect(loadCMVersion).not.toHaveBeenCalled();
  });
  it("rechaza contexto o producto cambiado, conservando la edición", async () => {
    const f = fixture(); f.row.editedText = "Edición humana"; f.row.opportunity.detectedProductId = "changed";
    await expect(assertCurrentCMResponse(f.db, "tenant", "response")).rejects.toThrow("desactualizada");
    expect(f.row.editedText).toBe("Edición humana");
  });
  it("rechaza propuestas sin versión verificable", async () => {
    const f = fixture(); f.row.evidence = [];
    await expect(assertCurrentCMResponse(f.db, "tenant", "response")).rejects.toBeInstanceOf(CMStaleResponseError);
  });
  it("una falla de consulta no se confunde con una propuesta desactualizada", async () => {
    const f = fixture(); const unavailable = new Error("Database timeout");
    vi.mocked(loadCMVersion).mockRejectedValue(unavailable);
    await expect(assertCurrentCMResponse(f.db, "tenant", "response")).rejects.toBe(unavailable);
    expect(unavailable).not.toBeInstanceOf(CMStaleResponseError);
  });
  it("una revisión aprobada sigue vigente con una sola consulta de versión", async () => {
    const f = fixture(); f.row.approvedBy = "Fede";
    await expect(assertCurrentCMResponse(f.db, "tenant", "response")).resolves.toBeUndefined();
    expect(loadCMVersion).toHaveBeenCalledTimes(1);
    expect(loadCMVersion).toHaveBeenCalledWith(f.db, "tenant");
  });
  it("la aprobación no permite ignorar otros cambios de contexto", async () => {
    const f = fixture(); f.row.approvedBy = "Fede"; vi.mocked(loadCMVersion).mockResolvedValue("changed-context");
    await expect(assertCurrentCMResponse(f.db, "tenant", "response")).rejects.toThrow("desactualizada");
  });
});

import { describe, expect, it } from "vitest";
import { cmCoverageStatus, cmHash, cmInputHash, cmIsFresh, cmSelectBatch, cmStamp, type CMResponseState } from "../cm-freshness";

const opportunity = { sourceText: "¿Tiene soporte local?", sourceTitle: "Teclado", channelId: "youtube", detectedIntent: "GENERAL_DISCUSSION", detectedProductId: null, contextAssessment: {} };
const response = (id: string, changes: Partial<CMResponseState> = {}): CMResponseState => ({ id, evidence: [], editedText: "", approvedBy: "", acceptedAsCorrectAt: null, isPrimary: false, chatHistory: [], ...changes });

describe("vigencia y cobertura del Asistente CM", () => {
  it("detecta faltantes, respuestas anteriores al versionado y cambios de reglas", () => {
    expect(cmCoverageStatus([], "v1", opportunity)).toBe("missing");
    expect(cmCoverageStatus([response("old")], "v1", opportunity)).toBe("stale");
    const evidence = [cmStamp("v1", opportunity, "ai")];
    expect(cmIsFresh(evidence, "v1", opportunity)).toBe(true);
    expect(cmIsFresh(evidence, "v2", opportunity)).toBe(false);
    expect(cmIsFresh(evidence, "v1", { ...opportunity, sourceText: "¿Cuánto cuesta?" })).toBe(false);
    expect(cmIsFresh(evidence, "v1", { ...opportunity, detectedProductId: "different" })).toBe(false);
  });
  it("ignora fechas operativas y usa el mismo objetivo implícito y explícito", () => {
    const explicit = { ...opportunity, contextAssessment: { copilot: { goal: "RESPONDER", style: "NORMAL", generatedAt: "later", pulse: { selectedAt: "now" } } } };
    expect(cmInputHash(opportunity)).toBe(cmInputHash(explicit));
    expect(cmHash({ b: 1, a: 2 })).toBe(cmHash({ a: 2, b: 1 }));
  });
  it("exige revisar una propuesta nueva cuando se conserva una respuesta editada", () => {
    const rows = [response("new", { evidence: [cmStamp("v1", opportunity, "ai")] }), response("human", { isPrimary: true, editedText: "Corrección de Fede" })];
    expect(cmCoverageStatus(rows, "v1", opportunity)).toBe("review");
    // A successful manual regeneration resolves an older maintenance failure.
    expect(cmCoverageStatus(rows, "v1", opportunity, true)).toBe("review");
    expect(cmCoverageStatus([response("old")], "v1", opportunity, true)).toBe("error");
    expect(cmCoverageStatus([rows[0]], "v1", opportunity)).toBe("fresh");
  });
  it("alterna faltantes y desactualizadas y reserva espacio para la más antigua", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: String(index), priority: "HIGH", createdAt: new Date(index), status: index % 2 ? "missing" as const : "stale" as const }));
    const batch = cmSelectBatch(rows, 4);
    expect(batch).toHaveLength(4);
    expect(new Set(batch.map((item) => item.id)).size).toBe(4);
    expect(batch.map((item) => item.status)).toContain("missing");
    expect(batch.map((item) => item.status)).toContain("stale");
    expect(batch.map((item) => item.id)).toContain("0");
    expect(cmSelectBatch(rows, 0)).toEqual([]);
  });
  it("prioriza una actualización urgente sobre un faltante de prioridad baja", () => {
    const rows = [{ id: "missing", priority: "LOW", createdAt: new Date(), status: "missing" as const }, { id: "urgent", priority: "URGENT", createdAt: new Date(0), status: "stale" as const }];
    expect(cmSelectBatch(rows, 1)[0].id).toBe("urgent");
  });
});

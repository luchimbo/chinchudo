import { describe, expect, it } from "vitest";
import { coverageNeedsDetail, type CoverageRow } from "../cm-coverage-view";
const card = { coverageRevision: "same", responses: [{ id: "primary", isPrimary: true }] };
const row: CoverageRow = { id: "op", status: "fresh", error: "", revision: "same", primaryResponseId: "primary", latestResponseId: "primary" };
describe("actualizaciones ligeras de cobertura", () => {
  it("un cambio de estado o error no vuelve a cargar la conversación", () => {
    expect(coverageNeedsDetail(card, { ...row, status: "stale", error: "temporary" })).toBe(false);
  });
  it("una nueva propuesta principal requiere solo el detalle de esa tarjeta", () => {
    expect(coverageNeedsDetail(card, { ...row, primaryResponseId: "new" })).toBe(true);
  });
  it("una edición de la misma respuesta también se detecta por revisión", () => {
    expect(coverageNeedsDetail(card, { ...row, revision: "changed" })).toBe(true);
  });
  it("recupera propuestas para revisar que no estaban en la carga inicial", () => {
    expect(coverageNeedsDetail(card, { ...row, status: "review", latestResponseId: "new" })).toBe(true);
  });
  it("una variante ya recuperada no vuelve a solicitarse", () => {
    expect(coverageNeedsDetail({ ...card, responses: [...card.responses, { id: "new", isPrimary: false }] }, { ...row, status: "review", latestResponseId: "new" })).toBe(false);
  });
  it("inicializa metadatos sin pedir todos los detalles al primer resumen", () => {
    expect(coverageNeedsDetail({ responses: card.responses }, row)).toBe(false);
  });
  it("detecta respuestas eliminadas aunque el primer resumen estuviera pendiente", () => {
    expect(coverageNeedsDetail({ responses: card.responses }, { ...row, primaryResponseId: "", latestResponseId: "" })).toBe(true);
    expect(coverageNeedsDetail({ responses: [] }, { ...row, primaryResponseId: "", latestResponseId: "" })).toBe(false);
  });
});

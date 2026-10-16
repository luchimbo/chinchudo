import { describe, it, expect } from "vitest";
import { catalogIssues } from "./blog-catalog-issues";
const product = { id: "p", name: "Producto", externalId: "ref", url: "https://shop.test/old/", linkStatus: "active", missingRuns: 1 };
const baseline = { id: "sync", status: "PARTIAL", checkpoint: { discoveryComplete: true }, deployment: { verified: true }, changes: [] as any[], errors: [{ url: product.url, status: 404, error: "404" }] };
describe("incidencias abiertas del catálogo", () => {
  it("un 404 pendiente sigue visible hasta la segunda confirmación", () => {
    expect(catalogIssues([baseline], [product], []).open[0].message).toContain("segunda confirmación");
  });
  it("un retiro verificado deja de ser alerta sin borrar la evidencia", () => {
    const result = catalogIssues([baseline], [{ ...product, linkStatus: "missing", missingRuns: 2 }], []);
    expect(result.open).toHaveLength(0); expect(result.resolved[0].reason).toContain("Retiro confirmado"); expect(baseline.errors).toHaveLength(1);
  });
  it("el retiro aún no desplegado no se presenta como resuelto", () => {
    expect(catalogIssues([{ ...baseline, deployment: { verified: false } }], [{ ...product, linkStatus: "missing" }], []).open).toHaveLength(1);
  });
  it("una referencia obsoleta exige dos días y ausencia comprobada de uso antes de cerrar su alerta", () => {
    const url = "https://shop.test/obsolete/";
    const run = { ...baseline, checkpoint: { discoveryComplete: true, verifiedMissing: { "https://shop.test/obsolete": 2 } }, errors: [{ url, status: 404, error: "404" }] };
    expect(catalogIssues([run], [], [], [url]).open).toHaveLength(0);
    expect(catalogIssues([run], [], [], []).open).toHaveLength(1);
    expect(catalogIssues([{ ...run, checkpoint: { discoveryComplete: true, verifiedMissing: { "https://shop.test/obsolete": 1 } } }], [], [], [url]).open).toHaveLength(1);
  });
  it("un enlace reemplazado y verificado cierra el error histórico", () => {
    const run = { ...baseline, changes: [{ kind: "product", action: "update", ref: "ref", beforeUrl: product.url, afterUrl: "https://shop.test/new/", name: "Producto" }] };
    expect(catalogIssues([run], [{ ...product, url: "https://shop.test/new/" }], []).resolved[0].reason).toBe("Enlace recuperado");
  });
  const ambiguous = { ...baseline, errors: [], changes: [{ kind: "product", action: "review", ref: "product:1", name: "Producto", beforeUrl: "", afterUrl: "https://shop.test/new/", candidates: ["p"], incoming: { id: "1", name: "Producto", url: "https://shop.test/new/", sku: "SKU" } }] };
  it("expone la ficha entrante y solo candidatos aprobados", () => {
    expect(catalogIssues([ambiguous], [product, { ...product, id: "other" }], []).open[0]).toMatchObject({ incoming: { sku: "SKU" }, candidates: [product] });
  });
  it("una elección pendiente sigue visible hasta verificarse", () => {
    const resolution = { ...baseline, id: "resolution", checkpoint: { applied: true }, errors: [], changes: [{ ...ambiguous.changes[0], action: "update", resolvedFrom: "sync", reviewRef: "product:1" }], deployment: { verified: false } };
    expect(catalogIssues([resolution, ambiguous], [product], []).open[0].pending).toBe(true);
    expect(catalogIssues([{ ...resolution, deployment: { verified: true } }, ambiguous], [product], []).open).toHaveLength(0);
  });
});

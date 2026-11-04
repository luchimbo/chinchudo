import { describe, expect, it } from "vitest";
// @ts-ignore shared worker module
import { catalogSyncBlocksBlog, repairBlogContent, shouldRunBlogCalendar } from "./blog-auto-repair.mjs";
const catalog = { clientName: "PC MIDI Center", products: [{ externalId: "piano", name: "Piano MK885", url: "https://store.invalid/piano", linkStatus: "ok" }], categories: [{ key: "keys", name: "Teclados", url: "https://store.invalid/keys" }] };
describe("reparación automática editorial", () => {
  it("una sincronización abandonada no detiene el blog permanentemente", () => {
    const now = Date.parse("2026-11-04T19:00:00Z");
    expect(catalogSyncBlocksBlog({ status: "PENDING_DEPLOY", updatedAt: "2026-10-23T12:00:00Z" }, now)).toBe(false);
    expect(catalogSyncBlocksBlog({ status: "RUNNING", updatedAt: new Date(now - 60_000) }, now)).toBe(true);
    expect(catalogSyncBlocksBlog(null, now)).toBe(false);
  });
  it("atiende PC MIDI anterior al flag sin activar otros clientes por defecto", () => {
    expect(shouldRunBlogCalendar({ slug: "pcmidi", responsePolicy: { blog: { comparisons: true } } })).toBe(true);
    expect(shouldRunBlogCalendar({ slug: "pcmidi", responsePolicy: { blog: { calendar: false } } })).toBe(false);
    expect(shouldRunBlogCalendar({ slug: "other" })).toBe(false);
    expect(shouldRunBlogCalendar({ slug: "other", responsePolicy: { blog: { calendar: true } } })).toBe(true);
    expect(shouldRunBlogCalendar({ slug: "pcmidi" }, true)).toBe(false);
  });
  it("reconecta IDs antiguos solo cuando coincide exactamente el producto", () => {
    const original = { product_ids: ["analysis-old"], sections: [{ body: "Ver [[p:analysis-old|Piano MK885]]" }], brand_solution: { body: "Cierre revisado" } };
    const { content } = repairBlogContent(original, catalog);
    expect(content.product_ids).toEqual(["piano"]);
    expect(content.sections[0].body).toContain("[[p:piano|Piano MK885]]");
    expect(original.product_ids).toEqual(["analysis-old"]);
  });
  it("no inventa un destino cuando el modelo no está o es ambiguo", () => {
    const { content } = repairBlogContent({ product_ids: ["old"], sections: [{ body: "Ver [[p:old|Otro piano]]" }] }, catalog);
    expect(content.sections[0].body).toBe("Ver Otro piano"); expect(content.product_ids).toEqual([]);
    const ambiguous = repairBlogContent({ sections: [{ body: "[[p:old|Piano MK885]]" }] }, { ...catalog, products: [...catalog.products, { ...catalog.products[0], externalId: "duplicate" }] });
    expect(ambiguous.content.sections[0].body).toBe("Piano MK885");
  });
  it("completa un cierre faltante sin inventar stock, precio o garantía", () => {
    const { content, changes } = repairBlogContent({ primary_category_id: "keys" }, catalog);
    expect(changes).toContain("brand-closing"); expect(content.brand_solution.body).toContain("[[c:keys|Teclados]]");
    expect(content.brand_solution.body).not.toMatch(/stock|garantía|precio|cuotas/i);
  });
  it("conserva un cierre y enlaces vigentes escritos por el operador", () => {
    const original = { sections: [{ body: "[[p:piano|Mi texto]]" }], brand_solution: { title: "Título humano", body: "Edición humana" } };
    expect(repairBlogContent(original, catalog).content).toEqual(original);
  });
});

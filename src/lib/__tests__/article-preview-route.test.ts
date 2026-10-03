import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  assertClientAccess: vi.fn(),
  renderLandingHtml: vi.fn(),
  loadBlogEvidence: vi.fn(),
}));

// No hay métodos de escritura en el cliente simulado: cualquier intento de
// guardar o publicar desde la preview haría fallar estas pruebas.
vi.mock("@/lib/db", () => ({ prisma: { landing: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: mocks.assertClientAccess }));
vi.mock("@/lib/landing-html", () => ({ renderLandingHtml: mocks.renderLandingHtml }));
vi.mock("@/lib/blog-evidence", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/blog-evidence")>(),
  loadBlogEvidence: mocks.loadBlogEvidence,
}));

import { GET, POST } from "@/app/api/blog/articles/[id]/preview/route";
import { draftFromContent } from "@/lib/article-edit";
import { prisma } from "@/lib/db";

const client = { id: "client-2", slug: "prestige-running", landingTemplate: "custom" };
const content = {
  h1: "Artículo guardado",
  primary_category_id: "running",
  sections: [{ h2: "Elegir", body: "Contenido con [[p:producto|enlace]]." }],
  source_refs: [{ id: "manual", title: "Manual verificado" }],
  product_ids: ["producto"],
};
const params = { params: { id: "article-1" } };
const url = "http://localhost/api/blog/articles/article-1/preview";

function stored(body: unknown, status = "DRAFT") {
  return { id: "article-1", htmlContent: JSON.stringify(body), client, status };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(stored(content));
  mocks.assertClientAccess.mockResolvedValue(undefined);
  mocks.renderLandingHtml.mockResolvedValue("<!DOCTYPE html><html>Artículo real</html>");
  mocks.loadBlogEvidence.mockResolvedValue({ sources: content.source_refs });
});

describe("GET de vista previa guardada", () => {
  it.each(["DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"])("renderiza el contenido real en estado %s sin modificarlo", async (status) => {
    mocks.findUnique.mockResolvedValue(stored(content, status));
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Artículo real");
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.assertClientAccess).toHaveBeenCalledWith(prisma, client.id);
    expect(mocks.renderLandingHtml).toHaveBeenCalledTimes(1);
    expect(mocks.renderLandingHtml).toHaveBeenCalledWith(client, "article-1", content);
    expect(mocks.loadBlogEvidence).not.toHaveBeenCalled();
  });

  it("usa la revisión guardada pendiente de publicación, incluidas sus fuentes", async () => {
    const revision = { ...content, h1: "Título revisado", source_refs: [{ id: "otra-fuente" }] };
    mocks.findUnique.mockResolvedValue(stored({ ...content, pending_revision: { content: revision, publishable: false } }, "PUBLISHED"));
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    expect(mocks.renderLandingHtml).toHaveBeenCalledWith(client, "article-1", revision);
  });

  it("devuelve 404 cuando el artículo no existe", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(404);
    expect(mocks.renderLandingHtml).not.toHaveBeenCalled();
  });

  it("rechaza el acceso a un artículo de otro cliente antes de renderizar", async () => {
    mocks.assertClientAccess.mockRejectedValue(new Error("Acceso denegado"));
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(403);
    expect(mocks.renderLandingHtml).not.toHaveBeenCalled();
    expect(mocks.loadBlogEvidence).not.toHaveBeenCalled();
  });

  it.each(["{JSON roto", "null", "[]"])("rechaza contenido inválido sin recurrir a ejemplos: %s", async (htmlContent) => {
    mocks.findUnique.mockResolvedValue({ ...stored(content), htmlContent });
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(400);
    expect(mocks.renderLandingHtml).not.toHaveBeenCalled();
  });

  it("devuelve el error del renderizador sin intentar mostrar un ejemplo", async () => {
    mocks.renderLandingHtml.mockRejectedValue(new Error("Relay no disponible"));
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("Relay no disponible");
    expect(mocks.renderLandingHtml).toHaveBeenCalledTimes(1);
    expect(mocks.renderLandingHtml).toHaveBeenCalledWith(client, "article-1", content);
  });
});

describe("POST del editor", () => {
  it("superpone los cambios sin guardar a la revisión pendiente y conserva los demás datos", async () => {
    const revision = { ...content, h1: "Revisión guardada", hero_lede: "Bajada revisada" };
    mocks.findUnique.mockResolvedValue(stored({ ...content, pending_revision: { content: revision } }, "PUBLISHED"));
    const draft = { ...draftFromContent(revision), h1: "Cambio sin guardar", sections: [{ h2: "Nuevo", body: "Texto editado" }] };
    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify({ draft }) }), params);
    expect(response.status).toBe(200);
    expect(mocks.renderLandingHtml).toHaveBeenCalledWith(client, "article-1", expect.objectContaining({
      h1: draft.h1, sections: draft.sections, hero_lede: revision.hero_lede,
      source_refs: content.source_refs, product_ids: content.product_ids,
    }));
    expect(mocks.loadBlogEvidence).toHaveBeenCalledWith(prisma, client.id);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it("mantiene la validación de JSON inválido", async () => {
    const response = await POST(new Request(url, { method: "POST", body: "{" }), params);
    expect(response.status).toBe(400);
    expect(mocks.renderLandingHtml).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { blogTaskError } from "./blog-task-errors";

describe("motivos de bloqueo del calendario", () => {
  it("indica cómo corregir un título duplicado aunque el fallo provenga del despliegue", () => {
    expect(blogTaskError("DEPLOYMENT_FAILED", "Validacion fallida: articulo: seo_title duplicado", true)).toMatchObject({ action: "edit", label: "Revisar versiones" });
  });
  it("mantiene la acción de reintento para otros errores de despliegue", () => {
    expect(blogTaskError("DEPLOYMENT_FAILED", "HTTP 503", true)).toMatchObject({ action: "retry-publication" });
    expect(blogTaskError("", "", true)).toBeNull();
  });
});

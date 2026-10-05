import { describe, expect, it } from "vitest";
import { supportDestination } from "../support-destination";
import { SUPPORT_PATHS } from "../../../apps/admin/lib/dashboard-model";

describe("destino del soporte delegado", () => {
  it("usa únicamente rutas permitidas y siempre liga el cliente de la sesión", () => {
    for (const path of SUPPORT_PATHS) {
      const url = new URL(supportDestination({ targetPath: path }, "cliente-á"), "https://app.example");
      expect(url.origin).toBe("https://app.example");
      expect(url.pathname).toBe(path);
      expect(url.searchParams.get("client")).toBe("cliente-á");
    }
  });
  it("rechaza redirecciones externas, rutas arbitrarias y parámetros de otro cliente", () => {
    for (const path of ["https://other.example", "//other.example", "/\\other.example", "/api/auth/logout", "/blog?client=other", "/blog/../../login"]) expect(supportDestination({ targetPath: path }, "a")).toBe("/?client=a");
    expect(supportDestination(null, "a")).toBe("/?client=a");
    expect(supportDestination({ targetPath: 10 }, "a")).toBe("/?client=a");
  });
  it("abre la configuración inicial con regreso a configuración", () => {
    expect(supportDestination({ targetPath: "/onboarding" }, "a")).toBe("/onboarding?client=a&from=configuracion");
  });
});

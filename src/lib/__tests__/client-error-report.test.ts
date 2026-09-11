import { describe, expect, it } from "vitest";
import { buildClientErrorLog, clientErrorReportSchema } from "@/lib/client-error-report";

describe("reporte automático de errores de pantalla", () => {
  it("acepta una ruta interna y guarda metadatos acotados", () => {
    const parsed = clientErrorReportSchema.parse({
      name: "TypeError",
      message: "No se pudo leer la propiedad x",
      digest: "abc123",
      path: "/tendencias",
    });

    expect(buildClientErrorLog(parsed, "operador@ejemplo.com")).toEqual({
      event: "client_render_error",
      message: "TypeError en /tendencias: No se pudo leer la propiedad x",
      meta: {
        path: "/tendencias",
        errorName: "TypeError",
        digest: "abc123",
        reporter: "operador@ejemplo.com",
        source: "next_error_boundary",
      },
    });
  });

  it("rechaza rutas externas", () => {
    expect(clientErrorReportSchema.safeParse({ message: "falló", path: "https://otro-sitio.com" }).success).toBe(false);
  });
});

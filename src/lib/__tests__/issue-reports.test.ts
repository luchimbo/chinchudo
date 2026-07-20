import { describe, expect, it } from "vitest";
import { isDefaultIssueReporterUser } from "@/lib/auth";
import { createIssueReportSchema, getIssueSector, ISSUE_IMAGE_MAX_SIZE, ISSUE_IMAGE_TYPES } from "@/lib/issue-reports";

describe("reportes internos", () => {
  it("autoriza solamente al usuario global default", () => {
    expect(isDefaultIssueReporterUser({ username: "default" })).toBe(true);
    expect(isDefaultIssueReporterUser({ username: "admin@pcmidi.com" })).toBe(false);
    expect(isDefaultIssueReporterUser(null)).toBe(false);
  });

  it("clasifica el sector según la ruta reportada", () => {
    expect(getIssueSector("/landings/editor")).toBe("Creador de landings");
    expect(getIssueSector("/oportunidades?client=pcmidi")).toBe("Publicador en Redes");
    expect(getIssueSector("/configuracion/identidad")).toBe("Configuración");
    expect(getIssueSector("/?client=pcmidi")).toBe("Inicio");
    expect(getIssueSector("/cualquier-cosa")).toBe("Suite");
  });

  it("exige descripción y conserva la evidencia opcional", () => {
    expect(createIssueReportSchema.safeParse({ originPath: "/videos", description: "", imageUrl: "" }).success).toBe(false);
    const result = createIssueReportSchema.safeParse({ originPath: "/videos", description: "El guardado no responde", imageUrl: "https://example.com/evidencia.png" });
    expect(result.success).toBe(true);
    expect(ISSUE_IMAGE_TYPES).toContain("image/png");
    expect(ISSUE_IMAGE_MAX_SIZE).toBe(4 * 1024 * 1024);
  });
});

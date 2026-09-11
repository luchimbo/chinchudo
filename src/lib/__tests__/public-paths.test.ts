import { describe, expect, it } from "vitest";
import { isPublicPath } from "../public-paths";

describe("public-paths", () => {
  it("mantiene privadas las rutas que el bug de prefijo /l dejaba públicas", () => {
    // Regresión directa: src/middleware.ts tenía "/l" en PUBLIC_PATHS
    // evaluado con startsWith, lo que también matcheaba /leads, /landings
    // y /logins sin ninguna sesión.
    expect(isPublicPath("/leads")).toBe(false);
    expect(isPublicPath("/landings")).toBe(false);
    expect(isPublicPath("/landings/config")).toBe(false);
    expect(isPublicPath("/landings/editor")).toBe(false);
    expect(isPublicPath("/logins")).toBe(false);
    expect(isPublicPath("/l")).toBe(false);
    expect(isPublicPath("/loginz")).toBe(false);
    expect(isPublicPath("/api/authz")).toBe(false);
  });

  it("mantiene pública la landing publicada por slug", () => {
    expect(isPublicPath("/l/mi-landing")).toBe(true);
    expect(isPublicPath("/l/otra-landing")).toBe(true);
  });

  it("mantiene públicos los endpoints de auth y máquina", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/registro")).toBe(true);
    expect(isPublicPath("/recuperar")).toBe(true);
    expect(isPublicPath("/recuperar/abc123")).toBe(true);
    expect(isPublicPath("/verificar-email")).toBe(true);
    expect(isPublicPath("/invitacion/abc123")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/register")).toBe(true);
    expect(isPublicPath("/api/support/exchange")).toBe(true);
    expect(isPublicPath("/api/leads")).toBe(true);
    expect(isPublicPath("/api/events")).toBe(true);
    expect(isPublicPath("/api/click")).toBe(true);
    expect(isPublicPath("/api/unsubscribe")).toBe(true);
    expect(isPublicPath("/api/nurture")).toBe(true);
  });

  it("mantiene privadas las rutas del panel", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/copiloto")).toBe(false);
    expect(isPublicPath("/configuracion")).toBe(false);
    expect(isPublicPath("/api/stats")).toBe(false);
  });
});

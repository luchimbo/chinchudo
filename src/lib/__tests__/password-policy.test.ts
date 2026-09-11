import { describe, expect, it } from "vitest";
import { validatePassword } from "../password-policy";

describe("password-policy", () => {
  it("rechaza contraseñas cortas", () => {
    expect(validatePassword("corta123").valid).toBe(false);
  });

  it("acepta una contraseña razonable", () => {
    expect(validatePassword("una-contraseña-decente-2026").valid).toBe(true);
  });

  it("rechaza contraseñas comunes", () => {
    expect(validatePassword("password1").valid).toBe(false);
    expect(validatePassword("12345678901").valid).toBe(true); // no está en la lista, pero cumple longitud
  });

  it("rechaza si la contraseña es igual al email", () => {
    const result = validatePassword("usuario@ejemplo.com", "usuario@ejemplo.com");
    expect(result.valid).toBe(false);
  });

  it("rechaza contraseñas por encima del máximo", () => {
    expect(validatePassword("a".repeat(200)).valid).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { generateAccountToken, hashAccountToken } from "../account-tokens";

describe("account-tokens", () => {
  it("genera tokens únicos y suficientemente largos", () => {
    const a = generateAccountToken();
    const b = generateAccountToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("el hash es determinístico para el mismo token", () => {
    const token = generateAccountToken();
    expect(hashAccountToken(token)).toBe(hashAccountToken(token));
  });

  it("tokens distintos producen hashes distintos", () => {
    const a = generateAccountToken();
    const b = generateAccountToken();
    expect(hashAccountToken(a)).not.toBe(hashAccountToken(b));
  });

  it("el hash no revela el token (no es el token en texto plano)", () => {
    const token = generateAccountToken();
    expect(hashAccountToken(token)).not.toContain(token);
  });
});

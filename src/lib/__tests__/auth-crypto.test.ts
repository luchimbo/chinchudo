import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { hashPassword, verifyPassword, signJwt, verifyJwt } from "../auth-crypto";

describe("auth-crypto: JWT", () => {
  it("verifica un token propio y rechaza uno con secret distinto", () => {
    const token = signJwt({ email: "a@b.com" }, "secret-1");
    expect(verifyJwt(token, "secret-1")).toMatchObject({ email: "a@b.com" });
    expect(verifyJwt(token, "secret-2")).toBeNull();
  });

  it("rechaza un payload manipulado (firma ya no matchea)", () => {
    const token = signJwt({ role: "operator" }, "secret");
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ role: "admin", iat: 0, exp: 9999999999 })).toString("base64url");
    const tampered = `${header}.${tamperedPayload}.${signature}`;
    expect(verifyJwt(tampered, "secret")).toBeNull();
  });

  it("rechaza un token vencido", () => {
    const token = signJwt({ email: "a@b.com" }, "secret", -10);
    expect(verifyJwt(token, "secret")).toBeNull();
  });

  it("rechaza un token sin exp", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ email: "a@b.com" })).toString("base64url");
    const sig = createHmac("sha256", "secret").update(`${header}.${payload}`).digest("base64url");
    expect(verifyJwt(`${header}.${payload}.${sig}`, "secret")).toBeNull();
  });

  it("rechaza una firma de longitud distinta sin lanzar", () => {
    const token = signJwt({ email: "a@b.com" }, "secret");
    const [header, payload] = token.split(".");
    expect(() => verifyJwt(`${header}.${payload}.x`, "secret")).not.toThrow();
    expect(verifyJwt(`${header}.${payload}.x`, "secret")).toBeNull();
  });
});

describe("auth-crypto: passwords", () => {
  it("hashea y verifica correctamente (round-trip)", () => {
    const hash = hashPassword("una-contraseña-larga");
    expect(verifyPassword("una-contraseña-larga", hash)).toBe(true);
    expect(verifyPassword("otra-cosa", hash)).toBe(false);
  });

  it("no lanza con un hash corrupto o de formato legacy", () => {
    // Antes: timingSafeEqual lanzaba RangeError con buffers de longitud
    // distinta, convirtiendo un login inválido en un 500.
    expect(() => verifyPassword("cualquier-cosa", "salt:abc")).not.toThrow();
    expect(verifyPassword("cualquier-cosa", "salt:abc")).toBe(false);
    expect(() => verifyPassword("cualquier-cosa", "sin-dos-puntos")).not.toThrow();
    expect(verifyPassword("cualquier-cosa", "sin-dos-puntos")).toBe(false);
    expect(() => verifyPassword("cualquier-cosa", "salt:not-hex-zzzz")).not.toThrow();
    expect(verifyPassword("cualquier-cosa", "salt:not-hex-zzzz")).toBe(false);
  });
});

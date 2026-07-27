import { describe, expect, it } from "vitest";
import { hashSupportExchangeCode, isValidSupportClaims } from "../support-auth";

describe("support auth", () => {
  it("liga el hash tanto al código como al pepper", () => {
    const value = hashSupportExchangeCode("codigo-secreto", "pepper-a");
    expect(value).toHaveLength(64);
    expect(value).not.toBe(hashSupportExchangeCode("codigo-secreto", "pepper-b"));
    expect(value).not.toBe(hashSupportExchangeCode("otro-codigo", "pepper-a"));
  });

  it("solo acepta claims tenant-scoped completos", () => {
    expect(isValidSupportClaims({ type: "support_session", sid: "s1", clientId: "c1" })).toBe(true);
    expect(isValidSupportClaims({ type: "support_session", sid: "s1" })).toBe(false);
    expect(isValidSupportClaims({ type: "platform_admin", sid: "s1", clientId: "c1" })).toBe(false);
    expect(isValidSupportClaims(null)).toBe(false);
  });
});

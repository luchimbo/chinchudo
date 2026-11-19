import { afterEach, describe, expect, it } from "vitest";
import { decryptSocialToken, encryptSocialToken } from "../social-token-crypto";

const originalKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("social token encryption", () => {
  it("cifra tokens con autenticación y recupera el valor original", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSocialToken("refresh-token-secreto");

    expect(encrypted).not.toContain("refresh-token-secreto");
    expect(decryptSocialToken(encrypted)).toBe("refresh-token-secreto");
    const [iv, tag, ciphertext] = encrypted.split(".");
    const alteredTag = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
    expect(() => decryptSocialToken(`${iv}.${alteredTag}.${ciphertext}`)).toThrow();
  });
});

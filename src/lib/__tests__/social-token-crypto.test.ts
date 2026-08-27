import { afterEach, describe, expect, it } from "vitest";
import { decryptSocialToken, encryptSocialToken } from "../social-token-crypto";
import { runPublisher } from "../publish-agent";

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

describe("publication policy", () => {
  it("never invokes browser automation for YouTube or Meta", () => {
    expect(runPublisher({ channel: "youtube", sourceUrl: "https://youtube.com/watch?v=x", text: "hola", account: "cuenta" })).toEqual({ success: false, error: "official_youtube_api_required" });
    expect(runPublisher({ channel: "instagram", sourceUrl: "https://instagram.com/p/x", text: "hola", account: "cuenta" })).toEqual({ success: false, error: "human_handoff_required" });
    expect(runPublisher({ channel: "facebook", sourceUrl: "https://facebook.com/x", text: "hola", account: "cuenta" })).toEqual({ success: false, error: "human_handoff_required" });
  });
});

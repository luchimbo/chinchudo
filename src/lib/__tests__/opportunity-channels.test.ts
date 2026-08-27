import { describe, expect, it } from "vitest";
import { OPPORTUNITY_CHANNEL_NAMES } from "../opportunity-channels";

describe("OPPORTUNITY_CHANNEL_NAMES", () => {
  it("expone únicamente las redes operativas en los selectores", () => {
    expect(OPPORTUNITY_CHANNEL_NAMES).toEqual([
      "Facebook",
      "Instagram",
      "Reddit",
      "TikTok",
      "X",
      "YouTube",
    ]);
    expect(OPPORTUNITY_CHANNEL_NAMES).not.toContain("Foro");
    expect(OPPORTUNITY_CHANNEL_NAMES).not.toContain("Linkedin");
    expect(OPPORTUNITY_CHANNEL_NAMES).not.toContain("Art?culo web");
  });
});

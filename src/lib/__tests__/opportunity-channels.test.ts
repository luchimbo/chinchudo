import { describe, expect, it } from "vitest";
import { OPPORTUNITY_CHANNEL_NAMES, isOperationalOpportunityChannel, operationalOpportunityWhere } from "../opportunity-channels";

describe("OPPORTUNITY_CHANNEL_NAMES", () => {
  it("expone únicamente las redes operativas en los selectores", () => {
    expect(OPPORTUNITY_CHANNEL_NAMES).toEqual(["YouTube"]);
    expect(OPPORTUNITY_CHANNEL_NAMES).not.toContain("Foro");
    expect(OPPORTUNITY_CHANNEL_NAMES).not.toContain("Linkedin");
    expect(OPPORTUNITY_CHANNEL_NAMES).not.toContain("Art?culo web");
  });

  it("reconoce YouTube y compone el filtro operativo reutilizable", () => {
    expect(isOperationalOpportunityChannel("youtube")).toBe(true);
    expect(isOperationalOpportunityChannel("Instagram")).toBe(false);
    expect(operationalOpportunityWhere()).toEqual({ channel: { name: "YouTube" } });
  });
});

import { describe, expect, it } from "vitest";
import { dailyArticlePlan, validateDailyArticlePlan } from "./blog-daily-plan.mjs";

describe("plan diario por tema e idioma", () => {
  it("conserva el idioma de clientes sin plan", () => {
    expect(dailyArticlePlan(undefined, "en")).toEqual([["en"]]);
    expect(dailyArticlePlan(null, "invalid")).toEqual([["es"]]);
  });
  it("un tema en tres idiomas produce tres versiones", () => {
    const plan = validateDailyArticlePlan([["en", "es", "de"]]);
    expect(plan).toHaveLength(1);
    expect(plan.flat()).toHaveLength(3);
  });
  it("permite cantidades e idiomas distintos por tema", () => {
    expect(validateDailyArticlePlan([["de", "en"], ["es"], ["en", "de", "es"]]).flat()).toHaveLength(6);
  });
  it.each([[], [[]], [["fr"]], [["es", "es"]], Array.from({ length: 11 }, () => ["es"])])("rechaza planes inválidos: %j", plan => {
    expect(() => validateDailyArticlePlan(plan)).toThrow("Elegí");
  });
});

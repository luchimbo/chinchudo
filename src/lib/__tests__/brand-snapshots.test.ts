import { describe, expect, it } from "vitest";
import { argentinaNoon, metricDelta, scheduleForMilestone, type SnapshotMetrics } from "@/lib/brand-snapshots";

const zero: SnapshotMetrics = { configuration: { brands: 1 }, funnel: { opportunities: 0 }, landings: { total: 0 }, tracking: { total: 0 } };

describe("brand snapshots", () => {
  it("calcula los hitos desde una linea base comun", () => {
    const baseline = new Date("2026-07-14T15:00:00.000Z");
    expect(scheduleForMilestone(baseline, "D30").toISOString()).toBe("2026-08-13T15:00:00.000Z");
    expect(scheduleForMilestone(baseline, "D365").toISOString()).toBe("2027-07-14T15:00:00.000Z");
  });

  it("ancla los cortes al mediodia de Argentina", () => {
    expect(argentinaNoon(new Date("2026-07-14T20:32:00.000Z")).toISOString()).toBe("2026-07-14T15:00:00.000Z");
  });

  it("calcula variaciones sin mutar la foto base", () => {
    const next = { ...zero, funnel: { opportunities: 4, converted: 1 }, tracking: { total: 2 } };
    expect(metricDelta(next, zero)).toEqual({ configuration: { brands: 0 }, funnel: { opportunities: 4, converted: 1 }, landings: { total: 0 }, tracking: { total: 2 } });
  });
});

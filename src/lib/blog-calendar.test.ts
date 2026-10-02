import { describe, expect, it } from "vitest";
import { argentinaDate, dateOnly, monthBounds, shiftDate } from "./blog-calendar";

describe("blog-calendar", () => {
  it("usa la fecha de Argentina, no la UTC", () => {
    expect(argentinaDate(new Date("2026-10-01T01:30:00Z"))).toBe("2026-09-30");
  });

  it("suma días cruzando meses y años", () => {
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDate("2026-12-31", 14)).toBe("2027-01-14");
  });

  it("rechaza fechas inválidas", () => {
    expect(() => dateOnly("2026-02-30")).toThrow();
    expect(() => dateOnly("30/09/2026")).toThrow();
  });

  it("calcula los límites del mes", () => {
    const { start, end } = monthBounds("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(() => monthBounds("2026-13")).toThrow();
  });
});

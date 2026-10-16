import { describe, expect, it } from "vitest";
import { articleBackHref, blogEntryDestination, calendarHref, validCalendarDay } from "./blog-navigation";

describe("navegación del blog centrada en calendario", () => {
  it("abre el calendario conservando cliente, mes y selección", () => {
    expect(blogEntryDestination({ client: "pcmidi", month: "2026-12", day: "2026-12-31" })).toBe("/blog/calendario?client=pcmidi&month=2026-12&day=2026-12-31");
    expect(blogEntryDestination({})).toBe("/blog/calendario");
  });
  it("los enlaces antiguos con filtros abren artículos sin perder el filtro ni el cliente", () => {
    expect(blogEntryDestination({ status: "DRAFT", client: "prestige-running" })).toBe("/blog/articulos?status=DRAFT&client=prestige-running");
  });
  it("cambiar de mes o ir a hoy no conserva el día seleccionado", () => {
    expect(calendarHref("pcmidi", "2027-01")).toBe("/blog/calendario?client=pcmidi&month=2027-01");
    expect(calendarHref("pcmidi", "2026-12", "2026-12-31")).toContain("day=2026-12-31");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-10-14", "//evil.example", undefined])("ignora fechas inválidas o de otro mes: %s", day => {
    expect(validCalendarDay(day, "2026-02")).toBeUndefined();
  });
  it("acepta el día bisiesto y restaura el mismo mes y día al volver del editor", () => {
    expect(validCalendarDay("2028-02-29", "2028-02")).toBe("2028-02-29");
    expect(articleBackHref("pcmidi", "2026-11-01", "2026-10", "2026-10-14")).toBe("/blog/calendario?client=pcmidi&month=2026-10&day=2026-10-14");
  });
  it("descarta contexto inválido y nunca toma el cliente de una URL externa", () => {
    expect(articleBackHref("prestige-running", "2026-10-14", "//evil.example", "2026-10-14")).toBe("/blog/calendario?client=prestige-running&month=2026-10&day=2026-10-14");
    expect(articleBackHref("pcmidi", undefined)).toBe("/blog/articulos?client=pcmidi");
  });
});

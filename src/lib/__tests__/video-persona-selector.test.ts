import { describe, expect, it } from "vitest";
import { findSelectedVideoPersona, selectVideoPersonaName } from "../video-persona-selector";

const product = (overrides: Record<string, string> = {}) => ({
  name: "Producto",
  category: "general",
  description: "",
  technicalSpecs: "",
  useCases: "",
  brand: { name: "MidiPlus" },
  ...overrides,
}) as any;

describe("selectVideoPersonaName", () => {
  it.each([
    [product({ brand: { name: "Kressmer" } as any }), "Innovación"],
    [product({ category: "baterias-electronicas" }), "Práctico"],
    [product({ category: "controladores-midi" }), "Técnico"],
    [product({ description: "Ideal para alumnos principiantes" }), "Educativo"],
    [product(), "Comercial"],
  ])("elige %s", (input, expected) => expect(selectVideoPersonaName(input)).toBe(expected));

  it("no inventa una persona si no está configurada para el cliente", () => {
    expect(findSelectedVideoPersona([], product())).toBeNull();
  });
});

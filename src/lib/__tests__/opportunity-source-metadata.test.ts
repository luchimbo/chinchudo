import { describe, expect, it } from "vitest";
import { splitOpportunitySourcePreview } from "../opportunity-source-metadata";

describe("splitOpportunitySourcePreview", () => {
  it("separa comentarios y antigüedad del resumen", () => {
    expect(splitOpportunitySourcePreview("¿Cómo hago para pasar de trotar a correr? Reddit · r/BeginnersRunning Más de 40 comentarios · hace 1 año")).toEqual({
      text: "¿Cómo hago para pasar de trotar a correr? Reddit · r/BeginnersRunning",
      commentCount: "Más de 40 comentarios",
      publishedAgo: "hace 1 año",
    });
  });

  it("conserva los textos que no tienen esos metadatos", () => {
    expect(splitOpportunitySourcePreview("Necesito una interfaz para grabar guitarra")).toEqual({
      text: "Necesito una interfaz para grabar guitarra",
    });
  });
});

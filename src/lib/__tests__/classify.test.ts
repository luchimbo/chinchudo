import { describe, expect, it } from "vitest";
// detectIntent/detectPriority viven en el script de import; se exportan para testearlos.
import { detectIntent, detectPriority } from "../../../scripts/import-opportunities.mjs";
// @ts-ignore -- utilidad ESM compartida sin declaraciones TypeScript.
import { extractPostKey } from "../../../scripts/agent-utils.mjs";

describe("detectIntent", () => {
  it("driver/Windows → TECHNICAL_QUESTION", () => {
    expect(detectIntent("¿El driver funciona en Windows?")).toBe("TECHNICAL_QUESTION");
  });

  it("garantía → WARRANTY_QUESTION", () => {
    expect(detectIntent("¿Tiene garantía si se rompe?")).toBe("WARRANTY_QUESTION");
  });

  it("precio → PRICE_QUESTION", () => {
    expect(detectIntent("¿Cuánto cuesta?")).toBe("PRICE_QUESTION");
  });

  it("comprar/stock → PURCHASE_QUESTION", () => {
    expect(detectIntent("¿Conviene comprarlo? ¿Hay stock?")).toBe("PURCHASE_QUESTION");
  });

  it("comparación → COMPARISON", () => {
    expect(detectIntent("¿Qué diferencia entre estos dos modelos?")).toBe("COMPARISON");
  });

  it("sin señales → GENERAL_DISCUSSION", () => {
    expect(detectIntent("Qué lindo equipo")).toBe("GENERAL_DISCUSSION");
  });
});

describe("detectPriority", () => {
  it("Millenium + batería/modelo MPS → HIGH", () => {
    expect(detectPriority("GENERAL_DISCUSSION", "Opiniones sobre la bateria Millenium MPS-850")).toBe("HIGH");
  });
  it("compra/técnica → HIGH", () => {
    expect(detectPriority("PURCHASE_QUESTION", "x")).toBe("HIGH");
    expect(detectPriority("TECHNICAL_QUESTION", "x")).toBe("HIGH");
  });

  it("garantía/precio/comparación → MEDIUM", () => {
    expect(detectPriority("WARRANTY_QUESTION", "x")).toBe("MEDIUM");
    expect(detectPriority("PRICE_QUESTION", "x")).toBe("MEDIUM");
  });

  it("general sin urgencia → LOW", () => {
    expect(detectPriority("GENERAL_DISCUSSION", "comentario tranquilo")).toBe("LOW");
  });

  it("general con 'urgente' → HIGH", () => {
    expect(detectPriority("GENERAL_DISCUSSION", "lo necesito urgente")).toBe("HIGH");
  });
});

describe("extractPostKey", () => {
  it("agrupa las variantes de comentario de un post Facebook pfbid", () => {
    const post = "https://www.facebook.com/wallas.out/posts/pfbid02qtLpxNKq6XncQj1r2sP28uepQN2upuWTjxwVTbPfoazYoD4mALwpgKWfwnTNS9ycl";
    expect(extractPostKey("facebook", post)).toBe(extractPostKey("facebook", `${post}#comment-2`));
  });
});

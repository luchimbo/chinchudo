import { describe, expect, it, vi } from "vitest";
import { reachableCompetitorSuggestions, verifiedCompetitorSuggestions } from "../blog-competitor-research";

describe("investigación de rivales", () => {
  it("descarta marcas propias, fichas no oficiales y modelos repetidos", () => {
    const result = verifiedCompetitorSuggestions({ competitors: [
      { name: "Yamaha P-145", sourceUrl: "https://europe.yamaha.com/p-145" },
      { name: "Yamaha P-145", sourceUrl: "https://europe.yamaha.com/p-145" },
      { name: "Kressmer K-88", sourceUrl: "https://yamaha.com/k-88" },
      { name: "Roland FP-10", sourceUrl: "https://example.com/fp-10" },
    ] }, ["Kressmer"]);
    expect(result).toEqual([{ name: "Yamaha P-145", sourceUrl: "https://europe.yamaha.com/p-145" }]);
  });

  it("descarta enlaces rotos o redirigidos fuera del fabricante", async () => {
    const suggestions = [
      { name: "Yamaha P-145", sourceUrl: "https://europe.yamaha.com/p-145" },
      { name: "Casio AP-S450", sourceUrl: "https://www.casio.com/broken" },
      { name: "Roland FP-10", sourceUrl: "https://www.roland.com/fp-10" },
    ];
    const request = vi.fn(async (url: string | URL | Request) => {
      const input = String(url);
      if (input.includes("broken")) return { ok: false, url: input } as Response;
      if (input.includes("roland")) return { ok: true, url: "https://example.com/fp-10" } as Response;
      return { ok: true, url: input } as Response;
    });
    expect(await reachableCompetitorSuggestions(suggestions, request as typeof fetch)).toEqual([suggestions[0]]);
    expect(request).toHaveBeenCalledTimes(3);
  });
});

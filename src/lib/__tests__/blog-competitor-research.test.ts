import { describe, expect, it, vi } from "vitest";
import { reachableCompetitorSuggestions, sampleCatalog, verifiedCompetitorSuggestions } from "../blog-competitor-research";

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

  it("acepta cualquier fabricante con ficha en su propio dominio y rechaza tiendas y marcas del catálogo", () => {
    const result = verifiedCompetitorSuggestions({ competitors: [
      { brand: "Novation", name: "Launchkey 49 MK4", sourceUrl: "https://novationmusic.com/products/launchkey-49" },
      { brand: "Native Instruments", name: "Native Instruments Kontrol S49", sourceUrl: "https://www.native-instruments.com/en/products/komplete/keyboards/kontrol-s49/" },
      { brand: "Akai", name: "Akai MPK Mini IV", sourceUrl: "https://www.thomann.de/akai_mpk_mini.htm" },
      { brand: "Arturia", name: "Arturia KeyLab 49", sourceUrl: "https://www.arturia.com/products/keylab" },
      { brand: "Universal Audio", name: "Universal Audio Volt 2", sourceUrl: "https://www.uaudio.com/audio-interfaces/volt-2.html" },
    ] }, ["PC MIDI Center", "Arturia", "Midiplus"]);
    expect(result.map(item => item.name)).toEqual(["Novation Launchkey 49 MK4", "Native Instruments Kontrol S49", "Universal Audio Volt 2"]);
  });

  it("reparte la muestra del catálogo entre categorías", () => {
    const products = [..."aaaab"].map((category, index) => ({ name: `P${index}`, brand: "X", category, description: "" }));
    expect(sampleCatalog(products, 2).map(item => item.category)).toEqual(["a", "b"]);
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
    // La ficha rota se reintenta con GET antes de descartarla.
    expect(request).toHaveBeenCalledTimes(4);
  });
});

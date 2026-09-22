import { describe, expect, it } from "vitest";
import { CatalogIndex, catalogNameKey } from "../product-identity";

describe("identidad de productos del catálogo", () => {
  it("ignora mayúsculas, acentos y signos", () => {
    expect(catalogNameKey("MICRÓFONO CONDENSADOR USB ALCTRON UM900")).toBe(catalogNameKey("Microfono Condensador USB Alctron UM900"));
    expect(catalogNameKey("Placa de sonido Arturia MiniFuse 2 - Black")).toBe("placa de sonido arturia minifuse 2 black");
    expect(catalogNameKey("MiniFuse 2")).not.toBe(catalogNameKey("MiniFuse 4"));
    expect(catalogNameKey("PREVENTA Arturia KeyLab Essential 61 MK3 Aquamarine")).toBe(catalogNameKey("Arturia Keylab Essential 61 MK3 Aquamarine"));
    expect(catalogNameKey("Kit BM800 Azul (OUTLET)")).not.toBe(catalogNameKey("Kit BM800 Azul"));
  });

  it("reconoce por id, después por SKU y por último por nombre", () => {
    const index = new CatalogIndex([
      { id: "arturia-minifuse-2", name: "Placa de sonido Arturia MiniFuse 2", sourceExternalId: "ART-MF2" },
      { id: "midiplus-ak490", name: "MIDIPLUS AK490", sourceExternalId: null },
    ]);
    expect(index.find({ id: "midiplus-ak490", name: "otro nombre" })?.id).toBe("midiplus-ak490");
    expect(index.find({ externalId: "ART-MF2", name: "MiniFuse 2 renombrada" })?.id).toBe("arturia-minifuse-2");
    expect(index.find({ name: "Midiplus Ak490" })?.id).toBe("midiplus-ak490");
    expect(index.find({ name: "Producto nuevo" })).toBeNull();
  });

  it("recuerda lo que se crea durante la misma importación", () => {
    const index = new CatalogIndex<{ id: string; name: string }>();
    index.remember({ id: "nuevo", name: "Interfaz MiniFuse 2" });
    expect(index.find({ name: "INTERFAZ MINIFUSE 2" })?.id).toBe("nuevo");
  });
});

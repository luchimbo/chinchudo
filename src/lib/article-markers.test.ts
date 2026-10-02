import { describe, expect, it } from "vitest";
import { cleanLabel, docToMarkers, invalidMarkers, markersToDoc, markersToPlain, normalizeBody, parseMarkers, type ArticleCatalog } from "./article-markers";
import { wordDiff } from "./text-diff";

const catalog: ArticleCatalog = {
  products: [{ ref: "minilab-3", name: "Arturia MiniLab 3" }],
  categories: [{ ref: "interfaces", name: "Interfaces de audio" }],
  guides: [{ ref: "guia-completa-grabacion", name: "Guía completa de grabación" }],
};

const BODY = "Un [[c:interfaces|interfaz de audio]] te deja grabar.\n\nEl [[p:minilab-3]] entra en cualquier escritorio; mirá [[g:guia-completa-grabacion|la guía completa]] (sí, ¡esa!).";

describe("marcadores de artículos", () => {
  it("ida y vuelta sin cambios devuelve el mismo texto", () => {
    expect(docToMarkers(markersToDoc(BODY))).toBe(BODY);
  });

  it("convierte marcadores en nodos con y sin etiqueta", () => {
    const doc = markersToDoc(BODY);
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content?.[1]).toEqual({ type: "articleLink", attrs: { kind: "c", ref: "interfaces", label: "interfaz de audio" } });
    expect(doc.content[1].content?.[1]).toEqual({ type: "articleLink", attrs: { kind: "p", ref: "minilab-3", label: null } });
  });

  it("normaliza saltos simples y párrafos vacíos como el blog", () => {
    expect(normalizeBody("  uno\ncon salto \n\n\n\n dos  ")).toBe("uno con salto\n\ndos");
    expect(docToMarkers(markersToDoc("uno\ncon salto\n\n\ndos"))).toBe("uno con salto\n\ndos");
  });

  it("texto vacío produce un párrafo editable", () => {
    expect(markersToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(docToMarkers(markersToDoc(""))).toBe("");
  });

  it("limpia etiquetas que romperían el marcador", () => {
    expect(cleanLabel(" texto [raro] | con barra ")).toBe("texto raro con barra");
    const doc = { content: [{ type: "paragraph", content: [{ type: "articleLink", attrs: { kind: "c", ref: "interfaces", label: "a]]b|c" } }] }] };
    expect(docToMarkers(doc)).toBe("[[c:interfaces|abc]]");
  });

  it("detecta referencias fuera del catálogo", () => {
    expect(invalidMarkers(BODY, catalog)).toEqual([]);
    expect(invalidMarkers("[[p:no-existe]] y [[c:tampoco|x]] y [[g:otra]]", catalog)).toEqual(["p:no-existe", "c:tampoco", "g:otra"]);
  });

  it("lee marcadores y los muestra como texto", () => {
    expect(parseMarkers(BODY).map((m) => `${m.kind}:${m.ref}`)).toEqual(["c:interfaces", "p:minilab-3", "g:guia-completa-grabacion"]);
    expect(markersToPlain("El [[p:minilab-3]] y [[c:interfaces|una interfaz]]", catalog)).toBe("El Arturia MiniLab 3 y una interfaz");
  });
});

describe("diferencias por palabra", () => {
  it("marca palabras agregadas y quitadas", () => {
    const parts = wordDiff("un controlador compacto", "un controlador MIDI compacto y liviano");
    expect(parts.filter((p) => p.type === "added").map((p) => p.text.trim()).join(" ")).toBe("MIDI y liviano");
    expect(parts.some((p) => p.type === "removed")).toBe(false);
    expect(wordDiff("hola mundo", "hola").find((p) => p.type === "removed")?.text.trim()).toBe("mundo");
  });

  it("sin cambios es un único tramo igual", () => {
    expect(wordDiff("igual", "igual")).toEqual([{ type: "same", text: "igual" }]);
  });
});

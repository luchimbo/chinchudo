import { describe, expect, it } from "vitest";
import { resolveRespondedAt, sentResponseText, sortByRespondedAt } from "../sent-response-history";

const updatedAt = new Date("2026-09-17T15:25:21Z");

describe("resolveRespondedAt", () => {
  it("usa la publicación más reciente, no la última modificación", () => {
    const respondedAt = resolveRespondedAt({
      contextAssessment: {},
      updatedAt,
      publishingLogs: [{ publishedAt: new Date("2026-06-05T14:25:47Z") }, { publishedAt: new Date("2026-06-09T12:25:02Z") }],
    });
    expect(respondedAt.toISOString()).toBe("2026-06-09T12:25:02.000Z");
  });

  it("sin publicación registrada usa cuando se respondió desde el Asistente CM", () => {
    const respondedAt = resolveRespondedAt({
      contextAssessment: { copilot: { respondedAt: "2026-09-22T20:02:29.422Z" } },
      updatedAt,
      publishingLogs: [],
    });
    expect(respondedAt.toISOString()).toBe("2026-09-22T20:02:29.422Z");
  });

  it("ignora marcas inválidas y cae en la última modificación", () => {
    expect(resolveRespondedAt({ contextAssessment: { copilot: { respondedAt: "nope" } }, updatedAt, publishingLogs: [] })).toBe(updatedAt);
    expect(resolveRespondedAt({ contextAssessment: null, updatedAt, publishingLogs: [] })).toBe(updatedAt);
  });
});

describe("sortByRespondedAt", () => {
  const entries = [
    { id: "b", respondedAt: new Date("2026-06-05T00:00:00Z") },
    { id: "a", respondedAt: new Date("2026-09-22T00:00:00Z") },
    { id: "c", respondedAt: new Date("2026-06-05T00:00:00Z") },
  ];

  it("ordena por fecha de respuesta, más nuevas primero por defecto", () => {
    expect(sortByRespondedAt(entries, "newest").map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(sortByRespondedAt(entries, "oldest").map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sentResponseText", () => {
  it("prefiere lo que quedó publicado y, si falta, la respuesta primaria", () => {
    expect(sentResponseText({ editedText: "", draftText: "publicada" }, { editedText: "primaria", draftText: "" })).toBe("publicada");
    expect(sentResponseText(undefined, { editedText: "editada", draftText: "borrador" })).toBe("editada");
    expect(sentResponseText(undefined, undefined)).toBe("");
  });
});

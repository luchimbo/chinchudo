import { describe, expect, it } from "vitest";
import { isExternalCourseInquiry, kressmerTextReason } from "../kressmer-radar";
import { triageOpportunity } from "../opportunity-triage";

const title = "¿TE DIJERON QUE NO APRENDERÁS A TOCAR POR SER ADULTO? CURSO DE PIANO DE CERO";

describe("consultas a organizadores de cursos ajenos", () => {
  it.each([
    "Hermano todavía hay cupo para el reto de 30 días?",
    "¿Dónde me inscribo?",
    "¿Cuánto cuesta el curso de piano?",
    "¿Cuándo empieza el curso?",
    "Are there any spots left in the 30 day piano challenge?",
    "How much does the piano course cost?",
    "Kann ich mich für den Klavierkurs anmelden?",
    "Gibt es noch Plätze im Kurs?",
  ])("descarta la consulta administrativa aunque el video trate de piano: %s", (text) => {
    expect(isExternalCourseInquiry(text, title)).toBe(true);
    expect(kressmerTextReason(text, title)).toBe("external_course_inquiry");
    for (const clientSlug of ["kressmer", "pcmidi"]) {
      expect(triageOpportunity({ sourceText: text, sourceTitle: title, clientSlug, priority: "URGENT", detectedIntent: "PURCHASE_QUESTION" }))
        .toMatchObject({ action: "discard", reason: "external_course_inquiry" });
    }
  });
  it.each([
    "¿Qué piano me recomendás para hacer el curso?",
    "¿Necesito un teclado para el reto de 30 días?",
    "¿Me sirve uno de 61 teclas para las clases?",
    "¿Cuánto cuesta el piano para hacer el curso?",
    "Which keyboard should I buy for this piano course?",
    "Welches Digitalpiano empfehlen Sie für den Kurs?",
    "¿Todavía hay stock de Kressmer?",
  ])("conserva las necesidades reales de instrumentos: %s", (text) => {
    expect(isExternalCourseInquiry(text, title)).toBe(false);
  });
  it("no aplica una exclusión de instrumentos a un cliente que sí podría vender cursos", () => {
    expect(triageOpportunity({ sourceText: "¿Cuánto cuesta el curso?", clientSlug: "academia", priority: "URGENT", detectedIntent: "PURCHASE_QUESTION" }).action).toBe("keep");
  });
});

import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyToHtml, emailHtml, loadLeadMagnets, resourceText, sequenceSteps, trackedUrl, unsubscribeUrl } from "../nurture";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sequenceSteps", () => {
  it("ordena por día y descarta mensajes incompletos", () => {
    const steps = sequenceSteps({
      nurture_sequence: {
        day_5: { subject: "Cinco", body: "b5" },
        day_0: { subject: "Cero", body: "b0" },
        day_3: { subject: "", body: "sin asunto" },
        day_7: null,
      },
    });
    expect(steps.map((step) => step.day)).toEqual([0, 5]);
  });
});

describe("resourceText", () => {
  it("arma la checklist con los criterios y pasos de la landing", () => {
    const text = resourceText(
      { title: "Checklist MIDI", resource_type: "checklist" },
      { components: [{ cat: "Teclas", look: "Que sean sensibles" }], steps: [{ t: "Definí la DAW", b: "Antes de comprar" }] },
    );
    expect(text).toContain("Checklist MIDI");
    expect(text).toContain("[ ] Teclas: Que sean sensibles");
    expect(text).toContain("[ ] Definí la DAW: Antes de comprar");
  });
});

describe("bodyToHtml", () => {
  it("convierte checklists y listas, y escapa el contenido", () => {
    const html = bodyToHtml("---\nTu checklist\n[ ] Mirar <teclas>\n- Uno\n1. Primero\nTexto final.");
    expect(html).toContain("&#x2610;");
    expect(html).toContain("Mirar &lt;teclas&gt;");
    expect(html).toContain("<h2");
    expect(html).toMatch(/<ul style="padding-left:20px;margin:12px 0;"><li[^>]*>Uno<\/li><\/ul>/);
    expect(html).toContain("<ol");
    expect(html).not.toContain("<teclas>");
  });

  it("incluye CTA y baja cuando se pasan", () => {
    const html = emailHtml("Hola", { unsubscribeUrl: "https://blog/api/unsubscribe?x=1", categoryUrl: "https://www.pcmidi.com.ar/c/", categoryName: "Controladores MIDI" });
    expect(html).toContain("Ver Controladores MIDI");
    expect(html).toContain("darte de baja");
  });
});

describe("enlaces firmados", () => {
  it("la baja usa el mismo HMAC que valida /api/unsubscribe", () => {
    vi.stubEnv("NURTURE_UNSUBSCRIBE_SECRET", "s3cret");
    vi.stubEnv("NURTURE_UNSUBSCRIBE_BASE_URL", "https://blog.pcmidicenter.com/api/unsubscribe");
    const url = new URL(unsubscribeUrl("lead@example.com"));
    expect(url.searchParams.get("token")).toBe(createHmac("sha256", "s3cret").update("lead@example.com").digest("hex"));
  });

  it("el clic usa el payload que valida /api/click y el dominio del blog", () => {
    vi.stubEnv("NURTURE_UNSUBSCRIBE_SECRET", "s3cret");
    vi.stubEnv("NURTURE_UNSUBSCRIBE_BASE_URL", "https://blog.pcmidicenter.com/api/unsubscribe");
    const target = "https://www.pcmidi.com.ar/controladores-midi/";
    const url = new URL(trackedUrl(target, "lead1", "slug-x", 3));
    expect(url.origin + url.pathname).toBe("https://blog.pcmidicenter.com/api/click");
    expect(url.searchParams.get("token")).toBe(createHmac("sha256", "s3cret").update(`lead1|slug-x|3|${target}`).digest("hex"));
  });

  it("sin secreto no firma y deja la URL directa", () => {
    vi.stubEnv("NURTURE_UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NURTURE_SMTP_PASS", "");
    expect(trackedUrl("https://www.pcmidi.com.ar/", "l", "s", 0)).toBe("https://www.pcmidi.com.ar/");
    expect(unsubscribeUrl("a@b.com")).toBe("");
  });
});

describe("loadLeadMagnets", () => {
  it("lee las secuencias reales del blog", () => {
    const magnets = loadLeadMagnets();
    const magnet = magnets.get("controlador-midi-para-fl-studio");
    expect(magnet?.title).toBeTruthy();
    expect(sequenceSteps(magnet!)[0].day).toBe(0);
  });
});

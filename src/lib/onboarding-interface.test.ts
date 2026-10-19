import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { OnboardingWizard } from "@/app/onboarding/onboarding-wizard";
import { WelcomeChoices } from "@/app/bienvenida/welcome-choices";
import RegisterPage from "@/app/registro/page";
import { defaultDraft } from "./onboarding";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
function wizard(step: number, mode: "setup" | "edit" = "setup") {
  return cheerio.load(renderToStaticMarkup(React.createElement(OnboardingWizard, { preview: true, mode,
    initial: { draft: { ...defaultDraft("Negocio"), offer: "Clases de música" }, step, sourceUrl: "", businessType: "services", status: "IN_REVIEW", analysisError: "" } })));
}
describe("introducción simple y accesible", () => {
  it("el primer paso tiene una única acción de análisis y las opciones regionales quedan plegadas", () => {
    const $ = wizard(0);
    expect($("button").filter((_, node) => /Analizar.*página/.test($(node).text()))).toHaveLength(1);
    const advanced = $("details").filter((_, node) => $(node).find("summary").text() === "Otras opciones");
    expect(advanced).toHaveLength(1); expect(advanced.attr("open")).toBeUndefined();
    expect(advanced.text()).toContain("Zona horaria");
  });
  it("la revisión inicial muestra solo nombre, oferta y público opcional", () => {
    const $ = wizard(1);
    expect($("input")).toHaveLength(1); expect($("textarea")).toHaveLength(2);
    expect($("body").text()).toContain("A quién está dirigido (opcional)");
    expect($("body").text()).not.toMatch(/Conocimiento y comunicación|Catálogo candidato|Objetivos del negocio|Competidores|SEO/);
  });
  it("la activación no muestra contadores ni paneles avanzados", () => {
    const $ = wizard(2);
    expect($("body").text()).toContain("Empezar a usar Cafishia");
    expect($("body").text()).not.toMatch(/Conocimientos|Productos|Servicios|Dónde escuchar|Competidores/);
  });
  it("el editor existente conserva las opciones avanzadas y exige confirmar la revisión del conocimiento", () => {
    const $ = wizard(1, "edit");
    expect($("body").text()).toContain("Conocimiento y comunicación");
    expect($("input[type=checkbox]").last().closest("label").text()).toContain("Revisé y confirmo estos conocimientos");
  });
  it("el registro usa autocompletado y muestra la política antes de enviar", () => {
    const $ = cheerio.load(renderToStaticMarkup(React.createElement(RegisterPage)));
    expect($("#name").attr("autocomplete")).toBe("name"); expect($("#email").attr("autocomplete")).toBe("email");
    expect($("#clientName").attr("autocomplete")).toBe("organization"); expect($("#password").attr("autocomplete")).toBe("new-password");
    expect($("#password").attr("minlength")).toBe("10"); expect($("#password-help").text()).toContain("10 caracteres");
    expect($("button[type=submit]").text()).toBe("Crear cuenta"); expect($("button[aria-label='Mostrar contraseña']")).toHaveLength(1);
  });
  it("la bienvenida ofrece tres objetivos y permite ir al panel sin elegir", () => {
    const $ = cheerio.load(renderToStaticMarkup(React.createElement(WelcomeChoices, { clientSlug: "a" })));
    const actions = $("button").map((_, button) => $(button).text()).get();
    expect(actions).toHaveLength(4);
    expect(actions.join(" ")).toMatch(/Encontrar oportunidades.*Preparar contenido.*Responder consultas.*Ir al panel/);
  });
});

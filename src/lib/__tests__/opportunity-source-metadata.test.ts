import { describe, expect, it } from "vitest";
import { looksSpanish, pickYouTubeDisplayTitle, splitOpportunitySourcePreview, youtubeVideoTitle } from "../opportunity-source-metadata";

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

describe("youtubeVideoTitle", () => {
  const videoUrl = "https://www.youtube.com/watch?v=s2TCgiyZzb8";

  it("muestra solo el título guardado del video, sin la descripción", () => {
    expect(youtubeVideoTitle({
      channel: "YouTube",
      sourceText: "¿El piano definitivo para llevar a todos lados? | Reseña Korg Liano Buscas un piano digital ultra ligero? ...",
      sourceTitle: " ¿El piano definitivo para llevar a todos lados?  | Reseña Korg Liano ",
      sourceUrl: videoUrl,
    })).toBe("¿El piano definitivo para llevar a todos lados? | Reseña Korg Liano");
  });

  it("en comentarios no reemplaza el texto: lo que se responde es el comentario", () => {
    expect(youtubeVideoTitle({
      channel: "YouTube",
      sourceText: "¿Sirve para tocar en vivo?",
      sourceTitle: "Reseña Korg Liano",
      sourceUrl: `${videoUrl}&lc=Ugx123`,
    })).toBe("");
  });

  it("sin título guardado reconoce el formato viejo con el título al final", () => {
    expect(youtubeVideoTitle({
      channel: "YouTube",
      sourceText: "Probamos el controlador en vivo Published Mar 3, 2024 Review MidiPlus X6 - YouTube",
      sourceUrl: videoUrl,
    })).toBe("Review MidiPlus X6");
  });

  it("no aplica a otras redes", () => {
    expect(youtubeVideoTitle({
      channel: "Reddit",
      sourceText: "Necesito una interfaz para grabar guitarra",
      sourceTitle: "Interfaz para guitarra",
      sourceUrl: "https://www.reddit.com/r/audio/comments/abc/interfaz/",
    })).toBe("");
  });
});

describe("looksSpanish", () => {
  it.each([
    ["¿Qué es ASIO? ¿Lo necesito?", true],
    ["Review batería electrónica Yamaha DTX450K", true],
    ["MATERIAL OBLIGATORIO para correr los 250km de Volcano Ultramarathon", true],
    ["Ableton Push 3 vs Launchkey de $150: ¿Budget es simplemente MEJOR?", true],
    ["What Is ASIO? Do I Need It?", false],
    ["Arturia MiniLab 2 vs MiniLab 3 - Worth the upgrade?", false],
    ["I was pretty impressed by this MIDI controller!", false],
  ])("%s → %s", (title, expected) => {
    expect(looksSpanish(title)).toBe(expected);
  });
});

describe("pickYouTubeDisplayTitle", () => {
  it("usa la traducción al español de un video originalmente en inglés", () => {
    expect(pickYouTubeDisplayTitle({
      original: "Arturia MiniLab 2 vs MiniLab 3 - Worth the upgrade?",
      alternatives: ["Arturia MiniLab 2 vs MiniLab 3: ¿Vale la pena la actualización?"],
    })).toBe("Arturia MiniLab 2 vs MiniLab 3: ¿Vale la pena la actualización?");
  });

  it("deja el inglés si el video no tiene versión en español", () => {
    expect(pickYouTubeDisplayTitle({
      original: "What Is ASIO? Do I Need It?",
      alternatives: ["What Is ASIO? Do I Need It? - YouTube"],
    })).toBe("What Is ASIO? Do I Need It?");
  });

  it("mantiene el original en español aunque un buscador lo haya traducido al inglés", () => {
    expect(pickYouTubeDisplayTitle({
      original: "Del Sofá a los 5K | Plan Fácil para Empezar a Correr",
      alternatives: ["From Couch to 5K | Easy Plan to Start Running"],
    })).toBe("Del Sofá a los 5K | Plan Fácil para Empezar a Correr");
  });

  it("ignora títulos truncados y prefiere el que coincide con el texto guardado", () => {
    expect(pickYouTubeDisplayTitle({
      original: "MPK Mini Plus 37 key Midi Controller // Review",
      alternatives: ["Controlador MIDI MPK Mini Plus de ...", "Análisis del MPK Mini Plus", "Controlador MIDI MPK Mini Plus de 37 teclas: análisis"],
      sourceText: "Controlador MIDI MPK Mini Plus de 37 teclas: análisis En este video...",
    })).toBe("Controlador MIDI MPK Mini Plus de 37 teclas: análisis");
  });

  it("descarta el texto del reproductor y, sin original, usa el título que coincide con el texto", () => {
    expect(pickYouTubeDisplayTitle({
      original: "",
      alternatives: ["7:29 7:29 Reproduciendo", "Minilab 3 hidden feature", "¡Atención! La función oculta del Arturia Minilab 3"],
      sourceText: "¡Atención! La función oculta del Arturia Minilab 3 5 K vistas hace 2 años",
    })).toBe("¡Atención! La función oculta del Arturia Minilab 3");
    expect(pickYouTubeDisplayTitle({ original: "", alternatives: ["7:29 7:29 Reproduciendo"] })).toBe("");
  });
});

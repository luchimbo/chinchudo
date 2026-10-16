import { describe, expect, it } from "vitest";
import {
  HOOK_FORMULAS,
  analyzeReference,
  beatsFromScriptText,
  buildBeatSheet,
  buildScriptQualityReport,
  candidateFormulas,
  classifyHook,
  composeCaption,
  humanizeText,
  lintCaption,
  median,
  outlierBand,
  rankHooks,
  scoreHook,
  scoreHumanness,
  withOnScreenCards,
} from "../reel-craft";
import { words } from "../reel-craft/text";

describe("reel-craft: fórmulas", () => {
  it("tiene las 26 fórmulas con ids únicos", () => {
    expect(HOOK_FORMULAS).toHaveLength(26);
    expect(new Set(HOOK_FORMULAS.map((formula) => formula.id)).size).toBe(26);
  });

  it("clasifica hooks en español", () => {
    expect(classifyHook("Nadie te dice que el ruido de la batería viaja por el piso.")?.id).toBe(3);
    expect(classifyHook("Antes me llevaba una tarde armar un beat. Ahora veinte minutos.")?.id).toBe(5);
    expect(classifyHook("Pads de goma vs parches de malla: en casa no hay comparación.")?.id).toBe(17);
    expect(classifyHook("No necesitás un estudio para grabar voces.")?.id).toBe(20);
    expect(classifyHook("Hermoso atardecer")).toBeNull();
  });

  it("propone tres fórmulas distintas y respeta la preferida", () => {
    const formulas = candidateFormulas("SALE", 3);
    expect(formulas).toHaveLength(3);
    expect(formulas[0].id).toBe(3);
    expect(new Set(formulas.map((formula) => formula.id)).size).toBe(3);
  });
});

describe("reel-craft: puntaje de hook", () => {
  it("cuenta 18.000 como una sola palabra", () => {
    expect(words("Pagué $18.000 de más")).toEqual(["Pagué", "$18000", "de", "más"]);
  });

  it("castiga saludos y preámbulos", () => {
    const greeting = scoreHook("Hola chicos, en este video les voy a mostrar un controlador");
    expect(greeting.flags.length).toBeGreaterThanOrEqual(2);
    expect(greeting.verdict).toBe("WEAK");
  });

  it("premia un hook concreto, con tensión y al espectador", () => {
    const vague = scoreHook("Si tu vecino se queja del bombo, no compres otra batería.");
    const strong = scoreHook("Si tu vecino se queja del bombo, cambiá 2 pads.");
    expect(vague.checks.SPECIFICITY.score).toBe(15);
    expect(strong.verdict).toBe("STRONG");
    expect(strong.checks.ADDRESS.score).toBe(100);
  });

  it("ordena de mejor a peor", () => {
    const ranked = rankHooks(["Hola, hoy les traigo algo", "Nadie te dice que los pads de goma hacen ruido."]);
    expect(ranked[0].hook).toContain("Nadie");
  });

  it("marca emoji y hashtag en el hook", () => {
    expect(scoreHook("Mirá este pad 🔥 #musica").flags).toHaveLength(2);
  });
});

describe("reel-craft: beat sheet", () => {
  it("detecta el loop y marca beats largos", () => {
    const sheet = buildBeatSheet([
      "El vecino se quejaba del bombo.",
      "Cambiamos los pads de goma por parches de malla y le sumamos una alfombra gruesa debajo de toda la batería para cortar la vibración que viaja por el piso del departamento.",
      "Ahora el vecino ni se entera.",
    ].join("\n"), { target: 30 });
    expect(sheet).not.toBeNull();
    expect(sheet!.notes.some((note) => note.startsWith("Loop"))).toBe(true);
    expect(sheet!.beats.some((beat) => beat.flags.some((flag) => flag.includes("un solo beat")))).toBe(true);
    expect(sheet!.beats[0].label).toBe("HOOK");
    expect(sheet!.beats.at(-1)!.label).toBe("CTA");
  });

  it("avisa cuando no hay loop y cuando la tarjeta es larga", () => {
    const sheet = buildBeatSheet([{ spoken: "Tres errores con tu primer controlador.", onScreen: "tres errores que cometés con tu primer controlador MIDI" }, { spoken: "Escribinos y te asesoramos." }]);
    expect(sheet!.clean).toBe(false);
    expect(sheet!.notes.some((note) => note.startsWith("Sin loop"))).toBe(true);
    expect(sheet!.beats[0].flags.some((flag) => flag.includes("tarjeta"))).toBe(true);
  });

  it("devuelve null con guion vacío", () => {
    expect(buildBeatSheet("\n  \n")).toBeNull();
  });
});

describe("reel-craft: humanizador", () => {
  it("saca rayas, invisibles y frases prohibidas", () => {
    const result = humanizeText("Sin duda​ es el mejor del mercado — te recomiendo 100% este pad.");
    expect(result.text).not.toMatch(/—|​/);
    expect(result.text.toLowerCase()).not.toContain("mejor del mercado");
    expect(result.text.toLowerCase()).not.toContain("te recomiendo 100%");
    expect(result.replaced.length).toBeGreaterThanOrEqual(2);
  });

  it("no toca las URLs", () => {
    expect(humanizeText("Mirá https://pcmidi.com/increíble-oferta acá").text).toContain("https://pcmidi.com/increíble-oferta");
  });

  it("puntúa peor un texto con slop", () => {
    const sloppy = "Sin duda este increíble controlador revolucionario lleva tu música al siguiente nivel. Cabe destacar que es imprescindible. En definitiva es espectacular. Potenciá tu creatividad con esta experiencia única sin precedentes.";
    const human = "Che, lo probé tres semanas en casa. El MidiPlus X6 entra justo en el escritorio y no tuve que instalar drivers. Mirá cómo responde el pad 4. ¿Te pasa que la latencia te vuelve loco? A mí me pasaba con la placa vieja, ahora no.";
    expect(scoreHumanness(human).score).toBeGreaterThan(scoreHumanness(sloppy).score);
  });
});

describe("reel-craft: caption", () => {
  it("falla con más de 5 hashtags", () => {
    const report = lintCaption("Guardalo para tu próxima compra.\n\n#a #b #c #d #e #f");
    expect(report.ok).toBe(false);
    expect(report.hashtags).toHaveLength(6);
  });

  it("muestra el corte de 125 caracteres", () => {
    const report = lintCaption("x".repeat(200));
    expect(report.truncated).toBe(true);
    expect(report.visible.length).toBeLessThanOrEqual(126);
  });

  it("compone sin pasar el tope", () => {
    expect(composeCaption("Guardalo. #midi", ["home studio", "#midi", "a", "b", "c", "d", "e"]).match(/#/g)).toHaveLength(5);
  });
});

describe("reel-craft: outlier", () => {
  it("calcula mediana y banda", () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(median([])).toBeNull();
    expect(outlierBand(4)).toBe("signal");
    expect(outlierBand(1)).toBe("normal");
    expect(outlierBand(null)).toBe("unknown");
  });

  it("necesita 3 muestras del canal para dar múltiplo", () => {
    expect(analyzeReference({ title: "YouTube/Shorts: Nadie te dice esto del bombo", views: 9000, channel: "x", channelViews: [1000, 2000] }).outlierMultiple).toBeNull();
    const meta = analyzeReference({ title: "YouTube/Shorts: Nadie te dice esto del bombo", views: 9000, channel: "x", channelViews: [1000, 2000, 3000] });
    expect(meta.outlierMultiple).toBe(4.5);
    expect(meta.formulaId).toBe(3);
  });
});

describe("reel-craft: edición", () => {
  it("conserva las tarjetas en pantalla al editar y reescribe el bloque de visualCues", () => {
    const previous = buildBeatSheet([{ spoken: "Hook viejo." }, { spoken: "El metal vibra.", onScreen: "METAL VIBRA" }, { spoken: "Escribinos." }]);
    const beats = beatsFromScriptText("El metal vibra.", "Escribinos.", previous);
    expect(beats[0].onScreen).toBe("METAL VIBRA");
    const sheet = buildBeatSheet([{ spoken: "Hook nuevo con 2 pads.", onScreen: "2 PADS" }, ...beats]);
    const cues = withOnScreenCards("Tarjetas en pantalla:\n0:00.0 VIEJA\n\nPlano cenital.", sheet);
    expect(cues).toContain("2 PADS");
    expect(cues).toContain("METAL VIBRA");
    expect(cues).not.toContain("VIEJA");
    expect(cues.endsWith("Plano cenital.")).toBe(true);
  });
});

describe("reel-craft: reporte de guion", () => {
  it("elige el mejor hook y arma resumen", () => {
    const report = buildScriptQualityReport({
      hookOptions: [
        { formulaId: 18, spoken: "Hola, hoy les muestro un pad.", onScreen: "PAD" },
        { formulaId: 3, spoken: "Nadie te dice que el bombo se escucha en el piso de abajo.", onScreen: "NADIE TE LO DICE" },
      ],
      beats: [{ spoken: "Con parches de malla baja muchísimo." }, { spoken: "Escribinos y te contamos qué piso conviene." }],
      caption: "Guardalo si practicás en depto.",
      hashtags: ["bateria"],
    });
    expect(report.hook.formulaId).toBe(3);
    expect(report.hookOptions).toHaveLength(2);
    expect(report.summary).toContain("#3");
    expect(report.beatSheet?.beats[0].text).toContain("Nadie");
  });
});

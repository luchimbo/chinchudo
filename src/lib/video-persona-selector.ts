import type { Brand, Persona, Product } from "@prisma/client";

type VideoProduct = Product & { brand: Pick<Brand, "name"> };

const PERSONA_BY_PRIORITY = [
  { name: "Innovación", matches: (text: string) => /kressmer|novedad|lanzamiento|nuevo modelo|diseno|premium|estetica|tendencia/.test(text) },
  { name: "Práctico", matches: (text: string) => /bateria|drum|percusion|ruido|vecin|auricular|parche|malla|rebote|practica/.test(text) },
  { name: "Técnico", matches: (text: string) => /controlador|midi|interfaz|daw|ableton|fl studio|logic|reaper|cubase|home studio|driver|compatib|produccion|sinte/.test(text) },
  { name: "Educativo", matches: (text: string) => /alumno|clase|ensen|aprend|principiante|empezar|hijo|hija|escuela|conservatorio/.test(text) },
] as const;

export function selectVideoPersonaName(product: VideoProduct): string {
  if (product.brand.name.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("kressmer")) {
    return "Innovación";
  }

  const text = [
    product.name,
    product.category,
    product.description,
    product.technicalSpecs,
    product.useCases,
  ]
    .join(" ")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return PERSONA_BY_PRIORITY.find((candidate) => candidate.matches(text))?.name ?? "Comercial";
}

export function findSelectedVideoPersona(personas: Persona[], product: VideoProduct): Persona | null {
  const personaName = selectVideoPersonaName(product);
  return personas.find((persona) => persona.name === personaName) ?? null;
}

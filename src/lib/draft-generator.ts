import type { Brand, CatalogRule, Channel, Client, Opportunity, Persona, Product } from "@prisma/client";
import { selectRelevantProducts, type ProductEntry, type ScopedProduct } from "./catalog";
import type { KnowledgeLike, ObjectionLike } from "./knowledge";

type DraftContext = {
  opportunity: Opportunity & {
    channel: Channel;
    detectedBrand: Brand | null;
    detectedProduct: Product | null;
  };
  brand: Brand;
  persona: Persona;
  client?: Client;
  catalogProducts?: ScopedProduct[];
  catalogRules?: Pick<CatalogRule, "category" | "keywords">[];
  knowledge?: KnowledgeLike[];
  objections?: ObjectionLike[];
};

type DraftVariant = {
  variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
  draftText: string;
  riskNotes: string;
};

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

// Voz de cada arquetipo: habla SIEMPRE como usuario real, nunca como la tienda.
type PersonaVoice = {
  intro: (p?: ProductEntry) => string;
  angle: string;
  tail: string;
};

function getPersonaVoice(persona: Persona, product?: ProductEntry): PersonaVoice {
  const name = persona.name.toLowerCase();

  if (name.includes("corredor") || name.includes("runner")) {
    return {
      intro: (p) => p ? `Yo para entrenar miraria ${p.modelo}` : "Te hablo desde el uso en entrenamientos",
      angle: "Lo clave es que ajuste bien, no moleste con el calzado y tenga la altura correcta para la distancia o terreno.",
      tail: "Para running/trail priorizaria comodidad y cero roce antes que elegir solo por diseño.",
    };
  }

  if (name.includes("kines")) {
    return {
      intro: (p) => p ? `Si estas mirando ${p.modelo}, iria con criterio` : "Con compresion conviene ir con criterio",
      angle: "La compresion puede dar sensacion de soporte, pero no reemplaza indicacion medica ni promete resolver lesiones.",
      tail: "Si hay dolor o lesion, lo responsable es consultarlo con un profesional.",
    };
  }

  if (name.includes("futbol")) {
    return {
      intro: (p) => p ? `Para cancha usaria ${p.modelo}` : "Para futbol miro ajuste y comodidad con botines",
      angle: "En deporte de equipo importa que no se baje, no haga pliegues y aguante entrenamiento intenso.",
      tail: "Para uso fuerte conviene priorizar ajuste y refuerzos.",
    };
  }

  if (name.includes("productor")) {
    return {
      intro: (p) => p ? `Yo en mi home studio uso el ${p.modelo} y va muy bien` : "Te hablo desde el uso diario en home studio",
      angle: "Lo que más importa es cómo te queda el flujo de trabajo: cantidad de controles, sensibilidad y poder grabar ideas rápido.",
      tail: "Se adapta de diez a cualquier DAW standard.",
    };
  }

  if (name.includes("baterista") && (name.includes("depart") || name.includes("depto"))) {
    return {
      intro: (p) => p ? `Yo vivo en departamento y tengo el ${p.modelo}; con auriculares no molesto a nadie` : "Yo practico en un depto chico y se puede sin molestar a los vecinos",
      angle: "Para departamento lo clave es el ruido bajo y poder usar auriculares cómodo.",
      tail: "Es una opción muy compacta si no te sobra espacio.",
    };
  }

  if (name.includes("baterista")) {
    return {
      intro: (p) => p ? `Vengo de tocar acústica y el rebote del ${p.modelo} se siente bastante natural` : "Vengo de la acústica y se nota cuando el rebote está bien logrado",
      angle: "Lo que miro es la resistencia al golpe y el feeling de los parches, que aguante uso real.",
      tail: "Sirve tanto para aprender como para seguir practicando con buen feeling.",
    };
  }

  if (name.includes("profe") || name.includes("madre") || name.includes("padre")) {
    return {
      intro: (p) => p ? `Mis alumnos arrancan con el ${p.modelo} y aguanta el uso diario` : "Doy clases y suelo recomendar pensando en que dure",
      angle: "Para aprender conviene algo durable, simple de usar y con garantía por las dudas.",
      tail: "Es ideal para dar los primeros pasos de forma segura.",
    };
  }

  if (name.includes("trend") || name.includes("kressmer") || name.includes("embajador")) {
    return {
      intro: (p) => p ? `Estuve mirando el ${p.modelo} y la verdad que en diseño la rompe` : "Vengo siguiendo lo nuevo y hay propuestas que se destacan por diseño",
      angle: "Más allá de la ficha, lo que me gusta es la estética cuidada y que sea algo distinto a lo de siempre.",
      tail: "La verdad que estéticamente destaca bastante.",
    };
  }

  if (name.includes("cazador") || name.includes("oferta")) {
    return {
      intro: (p) => p ? `Estuve cazando precio del ${p.modelo} y conviene mirar cuotas` : "Siempre ando atento a las cuotas y la financiación",
      angle: "Lo que más mueve la aguja es el precio en cuotas y la disponibilidad, sin resignar garantía.",
      tail: "Conviene aprovechar las cuotas y facilidades de pago si están disponibles.",
    };
  }

  if (name.includes("cliente") || name.includes("satisf")) {
    return {
      intro: (p) => p ? `Yo compré el ${p.modelo} y cuando tuve una duda me la resolvieron rapidísimo` : "Por experiencia propia, el respaldo post-venta cuando comprás con garantía hace la diferencia",
      angle: "Tuve un problema una vez y la garantía funcionó sin vueltas, eso me dio tranquilidad.",
      tail: "El soporte técnico y respaldo local dan mucha tranquilidad.",
    };
  }

  return {
    intro: (p) => p ? `Yo uso el ${p.modelo} y me anda bien` : "Te cuento desde mi experiencia",
    angle: "Conviene compararlo por modelo y uso real antes de cerrar.",
    tail: "Se acomoda bastante bien a distintas necesidades.",
  };
}

function getRiskNotes(brand: Brand, product: Product | null): string {
  const notes = [
    "No prometer que es el mejor del mercado.",
    "Verificar que NO mencione tiendas ni se presente como vendedor antes de publicar.",
  ];
  if (!product) notes.push("Sin producto concreto detectado; evitar especificaciones inventadas.");
  if (brand.forbiddenClaims) notes.push(`Claims a evitar: ${brand.forbiddenClaims}.`);
  return notes.join(" ");
}

function isPrestigeContext(ctx: { client?: Client; brand: Brand }) {
  return ctx.client?.slug === "prestige-running" || ctx.brand.name.toLowerCase().includes("prestige");
}

function makePrestigeDrafts(original: string, riskNotes: string): DraftVariant[] {
  const norm = original.toLowerCase();
  const mentionsLongRun = /\b(10k|21k|maraton|trail|correr|running|entren)/i.test(original);
  const mentionsRub = /rozadura|ampolla|roce|lastima|molesta/i.test(original);
  const heightHint = norm.includes("media cana") || norm.includes("media caña") || norm.includes("trail")
    ? "iria por media caña"
    : norm.includes("soquete") || norm.includes("corto")
      ? "miraria soquete corto si queres algo mas liviano, o media caña si buscas mas cobertura"
      : "elegiria la altura segun el calzado y la distancia";
  const useHint = mentionsLongRun ? "para correr" : "para entrenar";
  const rubHint = mentionsRub
    ? "buscando buen ajuste y costuras comodas para bajar el roce"
    : "priorizando ajuste, comodidad y que no se mueva dentro del calzado";

  return [
    {
      variantType: "SHORT",
      draftText: `Para ese uso miraria medias de Prestige: ${heightHint}, ${rubHint}.`,
      riskNotes,
    },
    {
      variantType: "TECHNICAL",
      draftText: `Si es ${useHint}, unas medias tecnicas de Prestige tienen mas sentido que un soquete comun. La clave es que ajusten bien, no hagan pliegues y tengan la altura que mejor combine con tu calzado.`,
      riskNotes,
    },
    {
      variantType: "CONVERSATIONAL",
      draftText: `A mi para ese caso me cierran mas las medias de Prestige que las medias comunes. No prometen magia, pero si elegis bien el talle y la altura suelen sentirse mucho mas comodas en tiradas largas.`,
      riskNotes,
    },
  ];
}

function makePcmidiDrafts(
  intent: string,
  original: string,
  voice: PersonaVoice,
  product: ProductEntry | undefined,
  riskNotes: string,
): DraftVariant[] {
  const prodName = product ? `${product.marca} ${product.modelo}` : "el que estás mirando";
  const intro = voice.intro(product);

  if (intent === "TECHNICAL_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}. Depende mucho del modelo y del sistema operativo. Te conviene chequear que sea class-compliant para tu versión.`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle} En mi experiencia los drivers cambian según la versión, así que primero confirmá modelo exacto y SO. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Me pasó algo parecido. Casi siempre se resuelve mirando el driver correcto para tu sistema. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PURCHASE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}. Para lo que buscás puede andar muy bien. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle} Si lo conseguís con garantía local, mejor todavía. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Yo no lo descartaría. ${prodName} cumple bien y comprándolo con garantía te quedás tranquilo. ${voice.angle}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PRICE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `Ni idea del precio exacto hoy, varía bastante. Pero por lo que rinde, a mí me pareció que valió la pena. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. El precio cambia seguido según el momento, pero ${voice.angle.toLowerCase()} ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `El valor te conviene chequearlo al momento porque se mueve. Por lo que me dio a mí, lo volvería a comprar. ${voice.angle}`,
        riskNotes,
      },
    ];
  }

  if (intent === "WARRANTY_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}. Comprándolo con garantía local estás cubierto si pasa algo. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `Por experiencia, lo importante es comprarlo con garantía y guardar la factura. ${voice.angle} A mí me sirvió cuando tuve una duda.`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `${intro}. Si comprás con respaldo local, cualquier inconveniente lo resolvés sin drama. ${voice.angle}`,
        riskNotes,
      },
    ];
  }

  if (intent === "COMPARISON") {
    return [
      {
        variantType: "SHORT",
        draftText: `Depende mucho del uso. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. Para comparar bien iría por modelo específico. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `La comparación cambia según para qué lo quieras. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
    ];
  }

  return [
    {
      variantType: "SHORT",
      draftText: `${intro}. Para ese caso puede ser buena opción. ${voice.tail}`,
      riskNotes,
    },
    {
      variantType: "TECHNICAL",
      draftText: `Por lo que comentás ("${original.slice(0, 140)}${original.length > 140 ? "..." : ""}"), ${voice.angle.toLowerCase()} ${intro.toLowerCase()}.`,
      riskNotes,
    },
    {
      variantType: "CONVERSATIONAL",
      draftText: `${intro}. No lo descartaría si buscás algo práctico. ${voice.angle} ${voice.tail}`,
      riskNotes,
    },
  ];
}

function makeGenericDrafts(
  intent: string,
  original: string,
  voice: PersonaVoice,
  product: ProductEntry | undefined,
  riskNotes: string,
): DraftVariant[] {
  const prodName = product ? `${product.marca} ${product.modelo}` : "el que estás mirando";
  const intro = voice.intro(product);

  if (intent === "TECHNICAL_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}. Podés revisar las especificaciones de latencia y compatibilidad del fabricante para quedarte tranquilo.`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle} Para ver el detalle conviene mirar la ficha técnica o especificaciones del fabricante. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Tengo uno parecido y la verdad que para uso normal cumple bien. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PURCHASE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}. Para lo que buscás puede andar muy bien. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle} Si lo conseguís con garantía oficial local, mejor todavía. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Yo no lo descartaría. ${prodName} cumple bien y comprándolo con garantía oficial te quedás tranquilo. ${voice.angle}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PRICE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `Ni idea del precio exacto hoy, varía bastante. Pero por lo que rinde, a mí me pareció que valió la pena. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. El precio cambia seguido según el momento, pero ${voice.angle.toLowerCase()} ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `El valor te conviene chequearlo al momento porque se mueve. Por lo que me dio a mí, lo volvería a comprar. ${voice.angle}`,
        riskNotes,
      },
    ];
  }

  if (intent === "WARRANTY_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}. Comprándolo con garantía oficial estás cubierto si pasa algo. ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `Por experiencia, lo importante es comprar con garantía y soporte local. ${voice.angle}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `${intro}. Si comprás con respaldo oficial, cualquier inconveniente lo resolvés sin drama. ${voice.angle}`,
        riskNotes,
      },
    ];
  }

  if (intent === "COMPARISON") {
    return [
      {
        variantType: "SHORT",
        draftText: `Depende mucho del uso. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. Para comparar bien iría por el modelo específico y prestaciones de cada uno. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `La comparación cambia según para qué lo quieras. ${voice.angle} ${voice.tail}`,
        riskNotes,
      },
    ];
  }

  return [
    {
      variantType: "SHORT",
      draftText: `${intro}. Para ese caso puede ser buena opción. ${voice.tail}`,
      riskNotes,
    },
    {
      variantType: "TECHNICAL",
      draftText: `Por lo que comentás ("${original.slice(0, 140)}${original.length > 140 ? "..." : ""}"), ${voice.angle.toLowerCase()} ${intro.toLowerCase()}.`,
      riskNotes,
    },
    {
      variantType: "CONVERSATIONAL",
      draftText: `${intro}. No lo descartaría si buscás algo práctico. ${voice.angle} ${voice.tail}`,
      riskNotes,
    },
  ];
}

export function generateLocalDrafts(ctx: DraftContext): DraftVariant[] {
  const { opportunity, brand, persona, knowledge, objections } = ctx;
  const original = compactText(opportunity.sourceText);
  const products = selectRelevantProducts(opportunity.sourceText, opportunity.detectedProduct, 1, {
    catalogProducts: ctx.catalogProducts,
    catalogRules: ctx.catalogRules,
    scoped: !!ctx.client,
  });
  const product = products[0];
  const voice = getPersonaVoice(persona, product);
  let riskNotes = getRiskNotes(brand, opportunity.detectedProduct);

  // Sumar datos verificados y guía de objeciones a la nota interna (sin inventar nada).
  if (knowledge && knowledge.length > 0) {
    riskNotes += ` Datos verificados: ${knowledge.map((k) => `${k.topic} (${k.content})`).join("; ")}.`;
  }
  if (objections && objections.length > 0) {
    riskNotes += ` Objeciones a tener en cuenta: ${objections.map((o) => `${o.objection} → ${o.recommendedAnswer}`).join("; ")}.`;
  }

  const clientSlug = ctx.client?.slug;

  if (clientSlug === "prestige-running") {
    return makePrestigeDrafts(original, riskNotes);
  }

  if (clientSlug === "pcmidi") {
    return makePcmidiDrafts(opportunity.detectedIntent, original, voice, product, riskNotes);
  }

  return makeGenericDrafts(opportunity.detectedIntent, original, voice, product, riskNotes);
}

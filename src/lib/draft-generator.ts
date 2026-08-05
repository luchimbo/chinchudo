import type { Brand, CatalogRule, Channel, Client, Opportunity, Persona, Product } from "@prisma/client";
import { selectRelevantProducts, type ProductEntry, type ScopedProduct } from "./catalog";
import type { KnowledgeLike, ObjectionLike } from "./knowledge";
import { deriveVoiceModulation, type ProfileContextForDraft } from "./observed-profiles";
import { makeJurispediaDrafts } from "./jurispedia-policy";
import { makeVidiaDrafts } from "./vidia-policy";
import { sanitizePublicDraft } from "./draft-output";

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
  observedProfile?: ProfileContextForDraft | null;
};

type DraftVariant = {
  variantType: "SHORT" | "TECHNICAL" | "CONVERSATIONAL";
  draftText: string;
  riskNotes: string;
};

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function profileToneHint(profile?: ProfileContextForDraft | null) {
  if (!profile) return "";
  if (profile.toneProfile === "casual") return " Mantendria un tono cercano y de hobby.";
  if (profile.toneProfile === "technical") return " Conviene mantenerlo claro y tecnico.";
  if (profile.toneProfile === "formal") return " Suena mejor si queda ordenado y prolijo.";
  if (profile.toneProfile === "direct") return " Mejor ir directo al punto.";
  return "";
}

function profileTopicGuard(profile?: ProfileContextForDraft | null) {
  // El historial es contexto para seleccionar el tono, nunca texto publicable.
  return "";
}

// Voz de cada arquetipo: habla SIEMPRE como usuario real, nunca como la tienda.
type PersonaVoice = {
  intro: (p?: ProductEntry) => string;
  angle: string;
  tail: string;
};

function applyVoiceModulation(voice: PersonaVoice, observedProfile?: ProfileContextForDraft | null): PersonaVoice {
  const modulation = deriveVoiceModulation(observedProfile);
  return {
    intro: (p) => {
      const base = voice.intro(p);
      if (modulation.styleLabel === "casual") return `${base}, te lo digo bien de usuario`;
      if (modulation.styleLabel === "technical") return `${base}, yendo a lo importante`;
      if (modulation.styleLabel === "formal") return `${base}, con un criterio bastante ordenado`;
      if (modulation.styleLabel === "direct") return `${base}, yendo bastante al punto`;
      if (modulation.styleLabel === "aspirational") return `${base}, con foco en la experiencia general`;
      return base;
    },
    angle: voice.angle,
    tail: voice.tail,
  };
}

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
    intro: (p) => p ? `${p.modelo} es una opción concreta para mirar` : "Conviene definir primero el uso principal",
    angle: "Compará el modelo y las funciones que realmente necesitás.",
    tail: "La elección tiene que responder al uso real.",
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

function makePrestigeDrafts(original: string, riskNotes: string, product?: ProductEntry, channel = ""): DraftVariant[] {
  const norm = original.toLowerCase();
  const mentionsLongRun = /\b(10k|21k|maraton|trail|correr|running|entren)/i.test(original);
  const mentionsRub = /rozadura|ampolla|roce|lastima|molesta/i.test(original);
  const mentionsCompression = /compresion|15-20|mm hg|pantorrillera|recuperacion|circulacion/i.test(original);
  const mentionsStyle = /facher|lind|estetic|color|combin|outfit|sobri/i.test(original);
  const mentionsPrice = /precio|cu[aá]nto|sale|barat|car[oa]|promo|pack|tripack|bipack/i.test(original);
  const heightHint = norm.includes("media cana") || norm.includes("media caña") || norm.includes("trail")
    ? "las de media cana van muy bien"
    : norm.includes("soquete") || norm.includes("corto")
      ? "los soquetes cortos son buena opcion si queres algo liviano, y la media cana suma mas cobertura"
      : "hay modelos cortos, quarter y media cana que cubren bien distintos usos";
  const useHint = mentionsLongRun ? "para correr" : "para entrenar";
  const rubHint = mentionsRub
    ? "tienen costuras mas comodas y buen ajuste, eso ayuda bastante con el roce"
    : "tienen buen ajuste, secan rapido y no se mueven tanto dentro del calzado";
  const valueHint = mentionsPrice
    ? "conviene revisar las condiciones vigentes antes de elegir"
    : "priorizan comodidad y ajuste para el entrenamiento";
  const technicalHint = mentionsCompression
    ? "la compresión puede sentirse como un ajuste más firme durante la actividad, siempre que esa característica esté confirmada para el modelo"
    : "el ajuste y los materiales deben verificarse en la ficha confirmada del modelo";
  const styleHint = mentionsStyle
    ? "si buscás más color o estética, revisá el modelo que mejor combine con tu equipo sin dejar de priorizar calce y comodidad"
    : "se nota que priorizan funcionalidad antes que puro look";

  const productName = product ? `las Prestige ${product.modelo}` : "unas medias técnicas adecuadas para ese uso";
  const visualChannel = /instagram|tiktok/i.test(channel);
  const prefix = visualChannel ? "" : "Por lo que comentás, ";
  const recommendation = product ? productName : "sin forzar una recomendación de modelo";

  return [
    {
      variantType: "SHORT",
      draftText: `${prefix}${recommendation} puede encajar bien: ${heightHint} y ${rubHint}.`,
      riskNotes,
    },
    {
      variantType: "TECHNICAL",
      draftText: `${prefix}${product ? `${productName} para ${useHint}` : "Para ese uso"} puede ser una opción práctica: ${technicalHint}.`,
      riskNotes,
    },
    {
      variantType: "CONVERSATIONAL",
      draftText: `${prefix}${product ? productName : "Priorizar un modelo técnico"} tiene sentido en ese caso: ${valueHint} y ${styleHint}.`,
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
  observedProfile?: ProfileContextForDraft | null,
): DraftVariant[] {
  const prodName = product ? `${product.marca} ${product.modelo}` : "el que estás mirando";
  const intro = voice.intro(product);
  const toneHint = profileToneHint(observedProfile);
  const topicGuard = profileTopicGuard(observedProfile);

  if (intent === "TECHNICAL_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}.${toneHint} Depende mucho del modelo y del sistema operativo. Te conviene chequear que sea class-compliant para tu versión.${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle}${toneHint} En mi experiencia los drivers cambian según la versión, así que primero confirmá modelo exacto y SO. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Me pasó algo parecido. Casi siempre se resuelve mirando el driver correcto para tu sistema. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PURCHASE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}.${toneHint} Para lo que buscás puede andar muy bien. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle}${toneHint} Si lo conseguís con garantía local, mejor todavía. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Yo no lo descartaría. ${prodName} cumple bien y comprándolo con garantía te quedás tranquilo. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PRICE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `Ni idea del precio exacto hoy, varía bastante.${toneHint} Pero por lo que rinde, a mí me pareció que valió la pena. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. El precio cambia seguido según el momento, pero ${voice.angle.toLowerCase()} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `El valor te conviene chequearlo al momento porque se mueve. Por lo que me dio a mí, lo volvería a comprar. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "WARRANTY_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}.${toneHint} Comprándolo con garantía local estás cubierto si pasa algo. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `Por experiencia, lo importante es comprarlo con garantía y guardar la factura. ${voice.angle}${toneHint} A mí me sirvió cuando tuve una duda.${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `${intro}. Si comprás con respaldo local, cualquier inconveniente lo resolvés sin drama. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "COMPARISON") {
    return [
      {
        variantType: "SHORT",
        draftText: `Depende mucho del uso. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. Para comparar bien iría por modelo específico. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `La comparación cambia según para qué lo quieras. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  return [
    {
      variantType: "SHORT",
      draftText: `${intro}.${toneHint} Para ese caso puede ser buena opción. ${voice.tail}${topicGuard}`,
      riskNotes,
    },
    {
      variantType: "TECHNICAL",
      draftText: `Por lo que comentás ("${original.slice(0, 140)}${original.length > 140 ? "..." : ""}"), ${voice.angle.toLowerCase()} ${intro.toLowerCase()}.${topicGuard}`,
      riskNotes,
    },
    {
      variantType: "CONVERSATIONAL",
      draftText: `${intro}. No lo descartaría si buscás algo práctico. ${voice.angle} ${voice.tail}${topicGuard}`,
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
  observedProfile?: ProfileContextForDraft | null,
): DraftVariant[] {
  const prodName = product ? `${product.marca} ${product.modelo}` : "el que estás mirando";
  const intro = voice.intro(product);
  const toneHint = profileToneHint(observedProfile);
  const topicGuard = profileTopicGuard(observedProfile);

  if (intent === "TECHNICAL_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}.${toneHint} Podés revisar las especificaciones de latencia y compatibilidad del fabricante para quedarte tranquilo.${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle}${toneHint} Para ver el detalle conviene mirar la ficha técnica o especificaciones del fabricante. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Tengo uno parecido y la verdad que para uso normal cumple bien. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PURCHASE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}.${toneHint} Para lo que buscás puede andar muy bien. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. ${voice.angle}${toneHint} Si lo conseguís con garantía oficial local, mejor todavía. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `Yo no lo descartaría. ${prodName} cumple bien y comprándolo con garantía oficial te quedás tranquilo. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "PRICE_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `Ni idea del precio exacto hoy, varía bastante.${toneHint} Pero por lo que rinde, a mí me pareció que valió la pena. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. El precio cambia seguido según el momento, pero ${voice.angle.toLowerCase()} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `El valor te conviene chequearlo al momento porque se mueve. Por lo que me dio a mí, lo volvería a comprar. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "WARRANTY_QUESTION") {
    return [
      {
        variantType: "SHORT",
        draftText: `${intro}.${toneHint} Comprándolo con garantía oficial estás cubierto si pasa algo. ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `Por experiencia, lo importante es comprar con garantía y soporte local. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `${intro}. Si comprás con respaldo oficial, cualquier inconveniente lo resolvés sin drama. ${voice.angle}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  if (intent === "COMPARISON") {
    return [
      {
        variantType: "SHORT",
        draftText: `Depende mucho del uso. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "TECHNICAL",
        draftText: `${intro}. Para comparar bien iría por el modelo específico y prestaciones de cada uno. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
      {
        variantType: "CONVERSATIONAL",
        draftText: `La comparación cambia según para qué lo quieras. ${voice.angle} ${voice.tail}${topicGuard}`,
        riskNotes,
      },
    ];
  }

  return [
    {
      variantType: "SHORT",
      draftText: `${intro}.${toneHint} Para ese caso puede ser buena opción. ${voice.tail}${topicGuard}`,
      riskNotes,
    },
    {
      variantType: "TECHNICAL",
      draftText: `Por lo que comentás ("${original.slice(0, 140)}${original.length > 140 ? "..." : ""}"), ${voice.angle.toLowerCase()} ${intro.toLowerCase()}.${topicGuard}`,
      riskNotes,
    },
    {
      variantType: "CONVERSATIONAL",
      draftText: `${intro}. No lo descartaría si buscás algo práctico. ${voice.angle} ${voice.tail}${topicGuard}`,
      riskNotes,
    },
  ];
}

export function generateLocalDrafts(ctx: DraftContext): DraftVariant[] {
  if (ctx.client?.slug === "jurispedia") {
    return makeJurispediaDrafts({
      text: ctx.opportunity.sourceText,
      channel: ctx.opportunity.channel.name,
      opportunityId: ctx.opportunity.id,
    });
  }
  if (ctx.client?.slug === "programa-vidia") {
    return makeVidiaDrafts(ctx.opportunity.sourceText, ctx.opportunity.channel.name);
  }
  const { opportunity, brand, persona, knowledge, objections, observedProfile } = ctx;
  const original = compactText(opportunity.sourceText);
  const products = selectRelevantProducts(opportunity.sourceText, opportunity.detectedProduct, 1, {
    catalogProducts: ctx.catalogProducts,
    catalogRules: ctx.catalogRules,
    scoped: !!ctx.client,
  });
  const product = products[0];
  const voice = applyVoiceModulation(getPersonaVoice(persona, product), observedProfile);
  let riskNotes = getRiskNotes(brand, opportunity.detectedProduct);
  const modulation = deriveVoiceModulation(observedProfile);

  // Sumar datos verificados y guía de objeciones a la nota interna (sin inventar nada).
  if (knowledge && knowledge.length > 0) {
    riskNotes += ` Datos verificados: ${knowledge.map((k) => `${k.topic} (${k.content})`).join("; ")}.`;
  }
  if (objections && objections.length > 0) {
    riskNotes += ` Objeciones a tener en cuenta: ${objections.map((o) => `${o.objection} → ${o.recommendedAnswer}`).join("; ")}.`;
  }

  if (observedProfile) {
    riskNotes += ` Perfil observado: tema actual ${observedProfile.currentTopic} (${observedProfile.currentTopicConfidence}); tono ${observedProfile.toneProfile}; intereses historicos ${observedProfile.historicalPrimaryTopics.join(", ") || "sin suficientes datos"}.`;
    riskNotes += ` Modulación aplicada a la voz: ${modulation.styleLabel}. ${modulation.guardrail}`;
    if (observedProfile.currentTopicConfidence === "low") {
      riskNotes += " La confianza del tema actual es baja; revisar manualmente antes de publicar.";
    }
  }

  const clientSlug = ctx.client?.slug;

  const drafts = clientSlug === "prestige-running"
    ? makePrestigeDrafts(original, riskNotes, product, opportunity.channel.name)
    : clientSlug === "pcmidi"
      ? makePcmidiDrafts(opportunity.detectedIntent, original, voice, product, riskNotes, observedProfile)
      : makeGenericDrafts(opportunity.detectedIntent, original, voice, product, riskNotes, observedProfile);
  return drafts.map((draft) => ({ ...draft, draftText: sanitizePublicDraft(draft.draftText) }));
}

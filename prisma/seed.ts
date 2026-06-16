import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const midiplus = await prisma.brand.upsert({
    where: { name: "MidiPlus" },
    update: {},
    create: {
      name: "MidiPlus",
      positioning: "Confiabilidad, soporte local y relacion precio-calidad para home studio y educacion musical.",
      tone: "Tecnico, claro, seguro y orientado a resolver dudas.",
      allowedClaims: "Soporte local; buena relacion precio-calidad; opcion practica para home studio; compra con garantia.",
      forbiddenClaims: "El mejor del mercado; superior a todas las marcas; garantia no confirmada; datos tecnicos no verificados."
    }
  });

  const kressmer = await prisma.brand.upsert({
    where: { name: "Kressmer" },
    update: {},
    create: {
      name: "Kressmer",
      positioning: "Linea nueva con diseno premium, novedad y propuesta diferenciada con respaldo comercial local.",
      tone: "Moderno, curioso, aspiracional y cuidadoso con claims tecnicos.",
      allowedClaims: "Linea nueva; estetica cuidada; propuesta diferente; consultar modelo, stock y garantia.",
      forbiddenClaims: "Lo mejor; exclusivo sin confirmacion; caracteristicas no verificadas; comparaciones absolutas."
    }
  });

  // Quinteto canonico de personas (fuente de verdad: AGENTS.md y persona-router.ts).
  const personas = [
    {
      name: "Técnico / Productor",
      role: "Valida la marca por componentes, drivers, compatibilidad MIDI/DAW y uso en home studio.",
      tone: "Preciso, practico y sin vender de mas.",
      goals: "Traducir especificaciones a beneficios reales y aclarar limites tecnicos.",
      preferredLength: "Media"
    },
    {
      name: "Baterista de Departamento",
      role: "Resuelve ruido, espacio, parches de malla y practica diaria en departamento.",
      tone: "Cotidiano, cercano y concreto.",
      goals: "Ayudar a elegir pensando en vecinos, silencio y rebote.",
      preferredLength: "Corta"
    },
    {
      name: "Trend-Setter Kressmer",
      role: "Posiciona Kressmer como novedad que la rompe: diseno y primeras impresiones.",
      tone: "Moderno, curioso y aspiracional, sin exagerar datos.",
      goals: "Mostrar Kressmer como opcion distinta y deseable.",
      preferredLength: "Corta a media"
    },
    {
      name: "Profe / Madre-Padre",
      role: "Recomienda desde aprendizaje, durabilidad, garantia oficial y confianza.",
      tone: "Didactico, criterioso y simple.",
      goals: "Orientar a alumnos, padres y escuelas hacia compras seguras.",
      preferredLength: "Media"
    },
    {
      name: "Cazador de Ofertas",
      role: "Aporta el dato de precio, cuotas, financiacion y disponibilidad en el local.",
      tone: "Directo, entusiasta y practico.",
      goals: "Destacar conveniencia y facilidad de compra sin claims falsos.",
      preferredLength: "Corta"
    }
  ];

  // Migracion sin perder historial: mapear cualquier nombre legacy (de la era AGENTS.md
  // o de la era vieja del router) al nombre canonico del quinteto. Si la fila legacy existe:
  //  - si el canonico aun no existe -> renombrar la fila (preserva FK de responses)
  //  - si el canonico ya existe -> mover responses al canonico y borrar la fila legacy
  const renameMap: Record<string, string> = {
    // Era AGENTS.md
    "Soporte Tecnico PC MIDI": "Técnico / Productor",
    "Productor / Home Studio": "Técnico / Productor",
    "Baterista De Departamento": "Baterista de Departamento",
    "Profe De Musica": "Profe / Madre-Padre",
    "Embajador Kressmer / Early User": "Trend-Setter Kressmer",
    // Era vieja del router
    "Productor Técnico": "Técnico / Productor",
    "Baterista Pro": "Baterista de Departamento",
    "Cliente Satisfecho": "Técnico / Productor",
    "Profe de Música": "Profe / Madre-Padre"
  };

  for (const [oldName, newName] of Object.entries(renameMap)) {
    if (oldName === newName) continue;
    const legacy = await prisma.persona.findUnique({ where: { name: oldName } });
    if (!legacy) continue;
    const target = await prisma.persona.findUnique({ where: { name: newName } });
    if (target) {
      await prisma.response.updateMany({ where: { personaId: legacy.id }, data: { personaId: target.id } });
      await prisma.persona.delete({ where: { id: legacy.id } });
    } else {
      await prisma.persona.update({ where: { id: legacy.id }, data: { name: newName } });
    }
  }

  // Upsert idempotente: refresca campos del quinteto y evita duplicados en reseeds.
  for (const persona of personas) {
    await prisma.persona.upsert({
      where: { name: persona.name },
      update: persona,
      create: persona
    });
  }

  const channels = [
    {
      name: "YouTube",
      type: "video_comments",
      baseUrl: "https://www.youtube.com",
      responseStyleNotes: "Permite respuestas mas tecnicas y con contexto."
    },
    {
      name: "TikTok",
      type: "short_video_comments",
      baseUrl: "https://www.tiktok.com",
      responseStyleNotes: "Conviene responder corto, natural y sin bloque largo."
    },
    {
      name: "Instagram",
      type: "reels_comments",
      baseUrl: "https://www.instagram.com",
      responseStyleNotes: "Respuesta breve, visual y conversacional."
    },
    {
      name: "Facebook",
      type: "groups_posts",
      baseUrl: "https://www.facebook.com",
      responseStyleNotes: "Puede admitir mas contexto, pero debe sonar comunitario."
    },
    {
      name: "X",
      type: "threads",
      baseUrl: "https://x.com",
      responseStyleNotes: "Respuesta muy corta, directa y facil de continuar."
    }
  ];

  for (const channel of channels) {
    await prisma.channel.upsert({
      where: { name: channel.name },
      update: {},
      create: channel
    });
  }

  await prisma.product.upsert({
    where: {
      brandId_name: {
        brandId: midiplus.id,
        name: "Controlador MIDI MidiPlus"
      }
    },
    update: {},
    create: {
      brandId: midiplus.id,
      name: "Controlador MIDI MidiPlus",
      category: "Controlador MIDI",
      description: "Producto de referencia para pruebas del MVP.",
      useCases: "Home studio, clases, produccion inicial, workflow simple.",
      warrantyNotes: "Confirmar condiciones vigentes antes de responder."
    }
  });

  await prisma.product.upsert({
    where: {
      brandId_name: {
        brandId: kressmer.id,
        name: "Producto Kressmer"
      }
    },
    update: {},
    create: {
      brandId: kressmer.id,
      name: "Producto Kressmer",
      category: "Linea nueva",
      description: "Placeholder para cargar modelos reales de Kressmer.",
      useCases: "Usuarios que buscan diseno, novedad y respaldo local.",
      warrantyNotes: "Confirmar stock y garantia por modelo."
    }
  });

  // --- Base de conocimiento (FAQs) de ejemplo ---
  // Idempotente: solo recrea las entradas marcadas source="seed"; respeta las cargadas a mano.
  await prisma.knowledgeBase.deleteMany({ where: { source: "seed" } });
  await prisma.knowledgeBase.createMany({
    data: [
      {
        brandId: midiplus.id,
        topic: "Garantia MidiPlus",
        content: "Los productos MidiPlus se venden con garantia oficial; conviene conservar la factura de compra.",
        source: "seed",
        confidence: "high"
      },
      {
        brandId: midiplus.id,
        topic: "Compatibilidad USB / drivers",
        content: "Los controladores MidiPlus suelen ser class-compliant por USB: en general no necesitan driver para funciones basicas en Windows o Mac. Confirmar modelo y sistema operativo ante la duda.",
        source: "seed",
        confidence: "medium"
      },
      {
        brandId: midiplus.id,
        topic: "Parches de malla y ruido",
        content: "Las baterias electronicas con parches de malla bajan el ruido mecanico y dan un rebote mas natural; con auriculares se puede practicar sin molestar a vecinos.",
        source: "seed",
        confidence: "medium"
      },
      {
        brandId: kressmer.id,
        topic: "Linea nueva Kressmer",
        content: "Kressmer es una linea nueva con diseno cuidado; conviene consultar modelo puntual, stock y garantia antes de decidir. Evitar claims absolutos.",
        source: "seed",
        confidence: "medium"
      }
    ]
  });

  // --- Objeciones frecuentes de ejemplo ---
  const seedObjections = [
    {
      brandId: null as string | null,
      objection: "Es muy barato, debe ser malo",
      recommendedAnswer: "El precio de entrada no define la calidad: muchos modelos rinden muy bien para arrancar y vienen con garantia. Depende del uso que le vayas a dar.",
      personaNotes: "Util para Cazador de Ofertas y Profe."
    },
    {
      brandId: midiplus.id,
      objection: "Necesita drivers complicados",
      recommendedAnswer: "La mayoria es plug-and-play por USB; si hay dudas conviene confirmar el modelo exacto y el sistema operativo antes de instalar nada.",
      personaNotes: "Tecnico / Productor."
    },
    {
      brandId: midiplus.id,
      objection: "Me preocupa el ruido para los vecinos",
      recommendedAnswer: "Con parches de malla y auriculares el ruido baja muchisimo; es una opcion comoda para departamento.",
      personaNotes: "Baterista de Departamento."
    }
  ];
  await prisma.objection.deleteMany({ where: { objection: { in: seedObjections.map((o) => o.objection) } } });
  await prisma.objection.createMany({ data: seedObjections });

  // --- Fuentes monitoreadas de ejemplo (idempotentes por label) ---
  const sources = [
    { label: "YouTube - controlador midi", channel: "youtube", query: "controlador midi", limit: 5 },
    { label: "YouTube - bateria electronica", channel: "youtube", query: "bateria electronica", limit: 5 },
    { label: "Reddit - MidiPlus", channel: "reddit", query: "MidiPlus", limit: 5 }
  ];
  for (const source of sources) {
    await prisma.monitoredSource.upsert({
      where: { label: source.label },
      update: {},
      create: source
    });
  }

  await prisma.promptVersion.upsert({
    where: {
      name_version: {
        name: "response-generator",
        version: "0.1.0"
      }
    },
    update: { active: true },
    create: {
      name: "response-generator",
      version: "0.1.0",
      active: true,
      systemPrompt: "Sos un asistente comercial de PC MIDI Center. Generas respuestas utiles, naturales y especificas. No inventes datos tecnicos.",
      userPromptTemplate: "Marca: {{brand}}\\nPersona: {{persona}}\\nRed: {{channel}}\\nComentario: {{sourceText}}\\nGenera variantes corta, tecnica y conversacional."
    }
  });

  const youtube = await prisma.channel.findUniqueOrThrow({ where: { name: "YouTube" } });

  await prisma.opportunity.create({
    data: {
      channelId: youtube.id,
      sourceUrl: "https://www.youtube.com/watch?v=demo",
      sourceAuthor: "usuario_demo",
      sourceText: "Estoy buscando un controlador MIDI para empezar en home studio, vale la pena MidiPlus?",
      detectedBrandId: midiplus.id,
      detectedIntent: "PURCHASE_QUESTION",
      priority: "HIGH",
      notes: "Caso demo para validar el tablero inicial."
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const json = (items: string[]) => JSON.stringify(items);

async function main() {
  const pcmidi = await prisma.client.upsert({
    where: { slug: "pcmidi" },
    update: {
      name: "PC MIDI Center",
      description: "Instrumentos musicales, controladores MIDI, interfaces de audio, baterias electronicas y home studio.",
      autoPublish: false,
      autoApprove: false,
      domainKeywords: json([
        "midiplus",
        "kressmer",
        "controlador midi",
        "interfaz de audio",
        "bateria electronica",
        "home studio",
        "daw",
        "piano digital",
        "teclado musical",
        "produccion musical",
        "auriculares estudio",
      ]),
      domainExclusions: json(["midi dress", "midi skirt", "piano bar", "midi length"]),
    },
    create: {
      name: "PC MIDI Center",
      slug: "pcmidi",
      description: "Instrumentos musicales, controladores MIDI, interfaces de audio, baterias electronicas y home studio.",
      autoPublish: false,
      autoApprove: false,
      domainKeywords: json([
        "midiplus",
        "kressmer",
        "controlador midi",
        "interfaz de audio",
        "bateria electronica",
        "home studio",
        "daw",
        "piano digital",
        "teclado musical",
        "produccion musical",
        "auriculares estudio",
      ]),
      domainExclusions: json(["midi dress", "midi skirt", "piano bar", "midi length"]),
    },
  });

  const prestigeClient = await prisma.client.upsert({
    where: { slug: "prestige-running" },
    update: {
      name: "Prestige Running",
      description: "Medias deportivas tecnicas para running, trail, compresion, uso diario deportivo y combos.",
      autoPublish: false,
      autoApprove: false,
      domainKeywords: json([
        "prestige running",
        "prestige medias",
        "medias deportivas",
        "medias tecnicas",
        "running",
        "trail",
        "soquetes running",
        "media caña",
        "cuarto de caña",
        "pantorrillera",
        "compresion graduada",
        "15-20 mm hg",
        "termicas",
        "ampollas",
        "sudoracion pies",
      ]),
      domainExclusions: json([
        "media cancha",
        "media hora",
        "medias tintas",
        "a medias",
        "media naranja",
        "media jornada",
        "media sancion",
      ]),
    },
    create: {
      name: "Prestige Running",
      slug: "prestige-running",
      description: "Medias deportivas tecnicas para running, trail, compresion, uso diario deportivo y combos.",
      autoPublish: false,
      autoApprove: false,
      domainKeywords: json([
        "prestige running",
        "prestige medias",
        "medias deportivas",
        "medias tecnicas",
        "running",
        "trail",
        "soquetes running",
        "media caña",
        "cuarto de caña",
        "pantorrillera",
        "compresion graduada",
        "15-20 mm hg",
        "termicas",
        "ampollas",
        "sudoracion pies",
      ]),
      domainExclusions: json([
        "media cancha",
        "media hora",
        "medias tintas",
        "a medias",
        "media naranja",
        "media jornada",
        "media sancion",
      ]),
    },
  });

  await prisma.brand.updateMany({ where: { name: "MidiPlus", clientId: null }, data: { clientId: pcmidi.id } });
  await prisma.brand.updateMany({ where: { name: "Kressmer", clientId: null }, data: { clientId: pcmidi.id } });

  const legacyPcmidiPersonaNames = [
    "Técnico / Productor",
    "Baterista de Departamento",
    "Trend-Setter Kressmer",
    "Profe / Madre-Padre",
    "Cazador de Ofertas",
  ];
  await prisma.persona.updateMany({
    where: { name: { in: legacyPcmidiPersonaNames }, clientId: null },
    data: { clientId: pcmidi.id },
  });

  const midiplus = await prisma.brand.upsert({
    where: { clientId_name: { clientId: pcmidi.id, name: "MidiPlus" } },
    update: {
      clientId: pcmidi.id,
      strengths: "Confiabilidad, soporte local y relacion precio-calidad para home studio y educacion musical.",
      tone: "Tecnico, claro, seguro y orientado a resolver dudas.",
      allowedClaims: "Soporte local; buena relacion precio-calidad; opcion practica para home studio; compra con garantia.",
      forbiddenClaims: "El mejor del mercado; superior a todas las marcas; garantia no confirmada; datos tecnicos no verificados.",
      competitorWeaknesses: "Marcas importadas genéricas carecen de soporte técnico local oficial y garantía en el país.",
    },
    create: {
      clientId: pcmidi.id,
      name: "MidiPlus",
      strengths: "Confiabilidad, soporte local y relacion precio-calidad para home studio y educacion musical.",
      tone: "Tecnico, claro, seguro y orientado a resolver dudas.",
      allowedClaims: "Soporte local; buena relacion precio-calidad; opcion practica para home studio; compra con garantia.",
      forbiddenClaims: "El mejor del mercado; superior a todas las marcas; garantia no confirmada; datos tecnicos no verificados.",
      competitorWeaknesses: "Marcas importadas genéricas carecen de soporte técnico local oficial y garantía en el país.",
    },
  });

  const kressmer = await prisma.brand.upsert({
    where: { clientId_name: { clientId: pcmidi.id, name: "Kressmer" } },
    update: {
      clientId: pcmidi.id,
      strengths: "Linea nueva con diseno premium, novedad y propuesta diferenciada con respaldo comercial local.",
      tone: "Moderno, curioso, aspiracional y cuidadoso con claims tecnicos.",
      allowedClaims: "Linea nueva; estetica cuidada; propuesta diferente; consultar modelo, stock y garantia.",
      forbiddenClaims: "Lo mejor; exclusivo sin confirmacion; caracteristicas no verificadas; comparaciones absolutas.",
      competitorWeaknesses: "Marcas tradicionales del mismo rango de precio ofrecen diseños plásticos desactualizados y nula diferenciación estética.",
    },
    create: {
      clientId: pcmidi.id,
      name: "Kressmer",
      strengths: "Linea nueva con diseno premium, novedad y propuesta diferenciada con respaldo comercial local.",
      tone: "Moderno, curioso, aspiracional y cuidadoso con claims tecnicos.",
      allowedClaims: "Linea nueva; estetica cuidada; propuesta diferente; consultar modelo, stock y garantia.",
      forbiddenClaims: "Lo mejor; exclusivo sin confirmacion; caracteristicas no verificadas; comparaciones absolutas.",
      competitorWeaknesses: "Marcas tradicionales del mismo rango de precio ofrecen diseños plásticos desactualizados y nula diferenciación estética.",
    },
  });

  const prestige = await prisma.brand.upsert({
    where: { clientId_name: { clientId: prestigeClient.id, name: "Prestige Running" } },
    update: {
      clientId: prestigeClient.id,
      strengths: "Medias deportivas tecnicas para running, trail, compresion y entrenamiento, con foco en comodidad, diseno y compra online simple.",
      tone: "Deportivo, practico, cercano y tecnico solo cuando aporta.",
      allowedClaims: "Medias tecnicas; opciones para running and trail; compresion graduada cuando el producto lo indique; envios a todo el pais; cuotas disponibles segun tienda.",
      forbiddenClaims: "Curar lesiones; evitar lesiones garantizado; mejorar rendimiento garantizado; recomendacion medica sin respaldo; stock/precio fijo sin verificar.",
      competitorWeaknesses: "Medias de algodón convencionales acumulan sudor, causan ampollas y no ofrecen ajuste ergonómico ni compresión graduada.",
    },
    create: {
      clientId: prestigeClient.id,
      name: "Prestige Running",
      strengths: "Medias deportivas tecnicas para running, trail, compresion y entrenamiento, con foco en comodidad, diseno y compra online simple.",
      tone: "Deportivo, practico, cercano y tecnico solo cuando aporta.",
      allowedClaims: "Medias tecnicas; opciones para running and trail; compresion graduada cuando el producto lo indique; envios a todo el pais; cuotas disponibles segun tienda.",
      forbiddenClaims: "Curar lesiones; evitar lesiones garantizado; mejorar rendimiento garantizado; recomendacion medica sin respaldo; stock/precio fijo sin verificar.",
      competitorWeaknesses: "Medias de algodón convencionales acumulan sudor, causan ampollas y no ofrecen ajuste ergonómico ni compresión graduada.",
    },
  });

  const pcmidiPersonas = [
    {
      name: "Técnico / Productor",
      role: "Valida la marca por componentes, drivers, compatibilidad MIDI/DAW y uso en home studio.",
      tone: "Preciso, practico y sin vender de mas.",
      goals: "Traducir especificaciones a beneficios reales y aclarar limites tecnicos.",
      preferredLength: "Media",
      angle: "Setup, compatibilidad, DAW, drivers y uso real.",
    },
    {
      name: "Baterista de Departamento",
      role: "Resuelve ruido, espacio, parches de malla y practica diaria en departamento.",
      tone: "Cotidiano, cercano y concreto.",
      goals: "Ayudar a elegir pensando en vecinos, silencio y rebote.",
      preferredLength: "Corta",
      angle: "Ruido, auriculares, espacio reducido y practica diaria.",
    },
    {
      name: "Trend-Setter Kressmer",
      role: "Posiciona Kressmer como novedad desde diseno, estetica y primeras impresiones.",
      tone: "Moderno, curioso y aspiracional, sin exagerar datos.",
      goals: "Mostrar Kressmer como opcion distinta y deseable.",
      preferredLength: "Corta a media",
      angle: "Diseno, novedad y propuesta diferenciada.",
    },
    {
      name: "Profe / Madre-Padre",
      role: "Recomienda desde aprendizaje, durabilidad, garantia oficial y confianza.",
      tone: "Didactico, criterioso y simple.",
      goals: "Orientar a alumnos, padres y escuelas hacia compras seguras.",
      preferredLength: "Media",
      angle: "Aprendizaje, compra segura y uso para principiantes.",
    },
    {
      name: "Cazador de Ofertas",
      role: "Aporta precio, cuotas, financiacion y disponibilidad en el local.",
      tone: "Directo, entusiasta y practico.",
      goals: "Destacar conveniencia y facilidad de compra sin claims falsos.",
      preferredLength: "Corta",
      angle: "Precio, cuotas, promos, stock y conveniencia.",
    },
  ];

  // Limpiar respuestas y personas viejas de prestige
  const oldPersonas = await prisma.persona.findMany({
    where: {
      clientId: prestigeClient.id,
      name: { in: ["El Corredor", "El Kinesiólogo", "El Futbolista", "Cazador de Promos Deportivo"] }
    }
  });
  const oldPersonaIds = oldPersonas.map((p) => p.id);
  await prisma.response.deleteMany({
    where: { personaId: { in: oldPersonaIds } }
  });
  await prisma.persona.deleteMany({
    where: { id: { in: oldPersonaIds } }
  });

  const prestigePersonas = [
    {
      name: "Técnico / Productor",
      role: "Aporta mirada tecnica sobre compresion, recuperacion, soporte y cuidado del pie sin prometer resultados medicos.",
      tone: "Criterioso, claro y responsable.",
      goals: "Explicar beneficios posibles y limites de las medias de compresion, evitando diagnosticos medicos.",
      preferredLength: "Media",
      angle: "Compresion graduada, soporte, recuperacion y cuidado de la pisada sin claims medicos.",
    },
    {
      name: "Baterista de Departamento",
      role: "Responde desde la experiencia de running, entrenamientos de calle, distancias y rozamiento diario.",
      tone: "Cercano, activo, cotidiano y con lenguaje de corredor urbano.",
      goals: "Ayudar a elegir medias segun distancia, comodidad, rebote/impacto y ampollas.",
      preferredLength: "Corta a media",
      angle: "Running urbano, trail, comodidad, rozamiento, ajuste y uso en entrenamiento diario.",
    },
    {
      name: "Trend-Setter Kressmer",
      role: "Posiciona las medias desde el diseño, estetica cuidada, ergonomia y primeras impresiones.",
      tone: "Moderno, curioso y estético, sin exagerar datos.",
      goals: "Mostrar las medias ergonómicas como opcion premium y de diseño de vanguardia.",
      preferredLength: "Corta",
      angle: "Diseño ergonómico, costuras planas, estética premium y tendencia.",
    },
    {
      name: "Profe / Madre-Padre",
      role: "Recomienda desde el aprendizaje, durabilidad, lavado frecuente y compra inteligente.",
      tone: "Didactico, criterioso y simple.",
      goals: "Orientar a estudiantes, padres y colegios hacia medias resistentes para deporte escolar.",
      preferredLength: "Media",
      angle: "Durabilidad, lavado frecuente, deporte escolar y compra segura.",
    },
    {
      name: "Cazador de Ofertas",
      role: "Resuelve precio, combos, tripacks, bipacks, cuotas, envios y disponibilidad.",
      tone: "Directo, practico y entusiasta.",
      goals: "Llevar al usuario a una compra inteligente y económica destacando envíos y promos.",
      preferredLength: "Corta",
      angle: "Packs, cuotas, promos, envios y conveniencia.",
    },
  ];

  for (const persona of [...pcmidiPersonas.map((p) => ({ ...p, clientId: pcmidi.id })), ...prestigePersonas.map((p) => ({ ...p, clientId: prestigeClient.id }))]) {
    await prisma.persona.upsert({
      where: { clientId_name: { clientId: persona.clientId, name: persona.name } },
      update: persona,
      create: persona,
    });
  }

  const channels = [
    {
      name: "YouTube",
      type: "video_comments",
      baseUrl: "https://www.youtube.com",
      responseStyleNotes: "Permite respuestas mas tecnicas y con contexto.",
    },
    {
      name: "TikTok",
      type: "short_video_comments",
      baseUrl: "https://www.tiktok.com",
      responseStyleNotes: "Conviene responder corto, natural y sin bloque largo.",
    },
    {
      name: "Instagram",
      type: "reels_comments",
      baseUrl: "https://www.instagram.com",
      responseStyleNotes: "Respuesta breve, visual y conversacional.",
    },
    {
      name: "Facebook",
      type: "groups_posts",
      baseUrl: "https://www.facebook.com",
      responseStyleNotes: "Puede admitir mas contexto, pero debe sonar comunitario.",
    },
    {
      name: "X",
      type: "threads",
      baseUrl: "https://x.com",
      responseStyleNotes: "Respuesta muy corta, directa y facil de continuar.",
    },
  ];

  for (const channel of channels) {
    await prisma.channel.upsert({
      where: { name: channel.name },
      update: channel,
      create: channel,
    });
  }

  const products = [
    {
      brandId: midiplus.id,
      name: "Controlador MIDI MidiPlus",
      category: "Controlador MIDI",
      description: "Producto de referencia para pruebas del MVP.",
      useCases: "Home studio, clases, produccion inicial, workflow simple.",
      warrantyNotes: "Confirmar condiciones vigentes antes de responder.",
    },
    {
      brandId: kressmer.id,
      name: "Producto Kressmer",
      category: "Linea nueva",
      description: "Placeholder para cargar modelos reales de Kressmer.",
      useCases: "Usuarios que buscan diseno, novedad y respaldo local.",
      warrantyNotes: "Confirmar stock y garantia por modelo.",
    },
    {
      brandId: prestige.id,
      name: "Trail Pro. Media caña. Art 1025",
      category: "Trail",
      description: "Media tecnica de media caña orientada a trail y entrenamiento.",
      useCases: "Trail, running, entrenamientos al aire libre y usuarios que prefieren mas cobertura.",
      warrantyNotes: "Confirmar stock, talle y color antes de responder.",
      priceRange: "Verificar en tienda antes de responder.",
    },
    {
      brandId: prestige.id,
      name: "Media de compresión graduada 15-20 mm Hg. Art 1010",
      category: "Compresion Graduada",
      description: "Media de compresion graduada indicada por la tienda como 15-20 mm Hg.",
      technicalSpecs: "Compresion graduada 15-20 mm Hg segun ficha publica.",
      useCases: "Entrenamiento, recuperacion y usuarios que buscan ajuste con compresion moderada.",
      warrantyNotes: "No prometer beneficios medicos; recomendar consulta profesional ante lesiones o patologias.",
      priceRange: "Verificar en tienda antes de responder.",
    },
    {
      brandId: prestige.id,
      name: "Core Run-Tech Design. Soquete tecnico media caña running-trail",
      category: "Medias tecnicas running",
      description: "Soquete tecnico de media caña para running y trail.",
      useCases: "Running, trail, entrenamientos y uso deportivo con calzado tecnico.",
      warrantyNotes: "Confirmar stock, talle y color antes de responder.",
      priceRange: "Verificar en tienda antes de responder.",
    },
    {
      brandId: prestige.id,
      name: "Pack x 3 Tech Basic - soquetes cortos con refuerzo",
      category: "Tripack",
      description: "Pack de tres soquetes cortos con refuerzo.",
      useCases: "Compra por conveniencia, entrenamiento frecuente y reposicion de uso diario.",
      warrantyNotes: "Confirmar stock, talle y colores del pack antes de responder.",
      priceRange: "Verificar en tienda antes de responder.",
    },
    {
      brandId: prestige.id,
      name: "Cuarto de caña. InMyself. Diseño ergonómico",
      category: "Cuarto de Caña",
      description: "Media cuarto de caña con diseno ergonomico segun ficha publica.",
      useCases: "Entrenamiento, caminata, gimnasio y usuarios que prefieren cobertura intermedia.",
      warrantyNotes: "Confirmar stock, talle y color antes de responder.",
      priceRange: "Verificar en tienda antes de responder.",
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { brandId_name: { brandId: product.brandId, name: product.name } },
      update: product,
      create: product,
    });
  }

  const catalogRules = [
    { clientId: pcmidi.id, category: "controladores-midi", keywords: ["midi", "controlador", "teclado", "keyboard", "octava"] },
    { clientId: pcmidi.id, category: "interfaces-audio", keywords: ["interfaz", "interface", "placa", "asio", "latencia", "grabar"] },
    { clientId: pcmidi.id, category: "baterias-electronicas", keywords: ["bateria", "drum", "electronica", "parche", "malla"] },
    { clientId: prestigeClient.id, category: "running", keywords: ["running", "correr", "runner", "maraton", "10k", "21k", "entrenamiento"] },
    { clientId: prestigeClient.id, category: "trail", keywords: ["trail", "montaña", "barro", "sendero", "trekking"] },
    { clientId: prestigeClient.id, category: "compresion", keywords: ["compresion", "15-20", "mm hg", "recuperacion", "circulacion"] },
    { clientId: prestigeClient.id, category: "futbol", keywords: ["futbol", "botines", "cancha", "partido", "entrenar"] },
    { clientId: prestigeClient.id, category: "promos-combos", keywords: ["combo", "pack", "tripack", "bipack", "promo", "descuento", "cuotas", "envio"] },
  ];

  for (const rule of catalogRules) {
    await prisma.catalogRule.upsert({
      where: { clientId_category: { clientId: rule.clientId, category: rule.category } },
      update: { keywords: json(rule.keywords) },
      create: { clientId: rule.clientId, category: rule.category, keywords: json(rule.keywords) },
    });
  }

  await prisma.knowledgeBase.deleteMany({ where: { source: "seed" } });
  await prisma.knowledgeBase.createMany({
    data: [
      {
        clientId: pcmidi.id,
        brandId: midiplus.id,
        topic: "Garantia MidiPlus",
        content: "Los productos MidiPlus se venden con garantia oficial; conviene conservar la factura de compra.",
        source: "seed",
        confidence: "high",
      },
      {
        clientId: pcmidi.id,
        brandId: midiplus.id,
        topic: "Compatibilidad USB / drivers",
        content: "Los controladores MidiPlus suelen ser class-compliant por USB: en general no necesitan driver para funciones basicas en Windows o Mac. Confirmar modelo y sistema operativo ante la duda.",
        source: "seed",
        confidence: "medium",
      },
      {
        clientId: pcmidi.id,
        brandId: kressmer.id,
        topic: "Linea nueva Kressmer",
        content: "Kressmer es una linea nueva con diseno cuidado; conviene consultar modelo puntual, stock y garantia antes de decidir. Evitar claims absolutos.",
        source: "seed",
        confidence: "medium",
      },
      {
        clientId: prestigeClient.id,
        brandId: prestige.id,
        topic: "Categorias Prestige Running",
        content: "La tienda organiza productos en soquetes cortos, cuarto de caña, media caña, largas, pantorrillera, trail, termicas, tripack, bipack, promos y compresion graduada.",
        source: "seed",
        confidence: "high",
      },
      {
        clientId: prestigeClient.id,
        brandId: prestige.id,
        topic: "Compra online Prestige Running",
        content: "La tienda comunica envios a todo el pais, pago con tarjetas o efectivo, compra segura y envio gratis al superar el minimo vigente. Verificar monto, cuotas, stock y precios antes de responder.",
        source: "seed",
        confidence: "high",
      },
      {
        clientId: prestigeClient.id,
        brandId: prestige.id,
        topic: "Compresion y salud",
        content: "Para medias de compresion, explicar solo lo que figura en el producto y evitar promesas medicas. Si el usuario menciona lesion, dolor persistente o patologia, sugerir consulta profesional.",
        source: "seed",
        confidence: "high",
      },
    ],
  });

  await prisma.objection.deleteMany({ where: { objection: { in: [
    "Es muy barato, debe ser malo",
    "Necesita drivers complicados",
    "Me preocupa el ruido para los vecinos",
    "Me salen ampollas cuando corro",
    "No se si elegir media corta, media caña o larga",
    "La compresion sirve para lesiones",
  ] } } });
  await prisma.objection.createMany({
    data: [
      {
        clientId: pcmidi.id,
        brandId: null,
        objection: "Es muy barato, debe ser malo",
        recommendedAnswer: "El precio de entrada no define la calidad: muchos modelos rinden muy bien para arrancar y vienen con garantia. Depende del uso que le vayas a dar.",
        personaNotes: "Util para Cazador de Ofertas y Profe.",
      },
      {
        clientId: pcmidi.id,
        brandId: midiplus.id,
        objection: "Necesita drivers complicados",
        recommendedAnswer: "La mayoria es plug-and-play por USB; si hay dudas conviene confirmar el modelo exacto y el sistema operativo antes de instalar nada.",
        personaNotes: "Tecnico / Productor.",
      },
      {
        clientId: pcmidi.id,
        brandId: midiplus.id,
        objection: "Me preocupa el ruido para los vecinos",
        recommendedAnswer: "Con parches de malla y auriculares el ruido baja muchisimo; es una opcion comoda para departamento.",
        personaNotes: "Baterista de Departamento.",
      },
      {
        clientId: prestigeClient.id,
        brandId: prestige.id,
        objection: "Me salen ampollas cuando corro",
        recommendedAnswer: "Conviene mirar ajuste, costuras, material y altura de la media segun distancia y calzado. Para running/trail, una media tecnica bien ajustada suele ayudar a reducir roce, pero no conviene prometer que elimina ampollas.",
        personaNotes: "El Corredor.",
      },
      {
        clientId: prestigeClient.id,
        brandId: prestige.id,
        objection: "No se si elegir media corta, media caña o larga",
        recommendedAnswer: "Depende del uso: soquete corto para algo mas liviano, media caña para running/trail con mas cobertura, y largas o pantorrilleras si buscas mayor cobertura en pierna. Lo ideal es cruzarlo con talle, calzado y terreno.",
        personaNotes: "El Corredor / El Futbolista.",
      },
      {
        clientId: prestigeClient.id,
        brandId: prestige.id,
        objection: "La compresion sirve para lesiones",
        recommendedAnswer: "La compresion puede aportar sensacion de soporte y ajuste, pero no reemplaza una indicacion medica. Si hay dolor, lesion o una condicion previa, mejor consultarlo con un profesional.",
        personaNotes: "El Kinesiologo.",
      },
    ],
  });

  const sources = [
    { clientId: pcmidi.id, label: "YouTube - controlador midi", channel: "youtube", query: "controlador midi", limit: 5 },
    { clientId: pcmidi.id, label: "YouTube - bateria electronica", channel: "youtube", query: "bateria electronica", limit: 5 },
    { clientId: pcmidi.id, label: "Reddit - MidiPlus", channel: "reddit", query: "MidiPlus", limit: 5 },
    { clientId: prestigeClient.id, label: "Instagram - Prestige Running", channel: "instagram", query: "prestige_running OR Prestige Running", limit: 5 },
    { clientId: prestigeClient.id, label: "TikTok - medias running", channel: "tiktok", query: "medias running OR medias deportivas", limit: 5 },
    { clientId: prestigeClient.id, label: "YouTube - medias compresion running", channel: "youtube", query: "medias compresion running", limit: 5 },
  ];

  for (const source of sources) {
    await prisma.monitoredSource.upsert({
      where: { label: source.label },
      update: source,
      create: source,
    });
  }

  const prestigePersonaRules = [
    { personaName: "Técnico / Productor", weight: 5, trigger: "keyword", pattern: "compresion|recuperacion|circulacion|lesion|dolor|tendon|gemelo|pantorrilla|15-20|kinesiologia|kinesio", reason: "consulta de compresion o cuidado fisico" },
    { personaName: "Baterista de Departamento", weight: 5, trigger: "keyword", pattern: "running|correr|runner|maraton|10k|21k|trail|ampolla|rozadura|entrenamiento", reason: "uso real de running/trail" },
    { personaName: "Trend-Setter Kressmer", weight: 5, trigger: "keyword", pattern: "ergonomico|diseño|estetica|premium|novedad|nuevo modelo", reason: "diseño o estetica premium" },
    { personaName: "Profe / Madre-Padre", weight: 5, trigger: "keyword", pattern: "colegio|escuela|hijo|hija|principiante|aprender|gimnasio", reason: "deporte escolar o aprendizaje" },
    { personaName: "Cazador de Ofertas", weight: 5, trigger: "keyword", pattern: "precio|cuanto|cuotas|promo|descuento|combo|pack|tripack|bipack|envio|stock", reason: "precio, combos, cuotas o envio" },
  ];

  for (const rule of prestigePersonaRules) {
    const persona = await prisma.persona.findUniqueOrThrow({
      where: { clientId_name: { clientId: prestigeClient.id, name: rule.personaName } },
    });
    await prisma.personaRule.deleteMany({
      where: {
        personaId: persona.id,
        trigger: rule.trigger,
        pattern: rule.pattern,
      },
    });
    await prisma.personaRule.create({
      data: {
        personaId: persona.id,
        weight: rule.weight,
        trigger: rule.trigger,
        pattern: rule.pattern,
        reason: rule.reason,
      },
    });
  }

  await prisma.promptVersion.upsert({
    where: { name_version: { name: "response-generator", version: "0.1.0" } },
    update: { active: true },
    create: {
      name: "response-generator",
      version: "0.1.0",
      active: true,
      systemPrompt: "Sos un asistente comercial. Generas respuestas utiles, naturales y especificas. No inventes stock, precio, garantia ni datos tecnicos.",
      userPromptTemplate: "Marca: {{brand}}\\nPersona: {{persona}}\\nRed: {{channel}}\\nComentario: {{sourceText}}\\nGenera variantes corta, tecnica y conversacional.",
    },
  });

  const youtube = await prisma.channel.findUniqueOrThrow({ where: { name: "YouTube" } });
  const instagram = await prisma.channel.findUniqueOrThrow({ where: { name: "Instagram" } });

  await prisma.opportunity.create({
    data: {
      channelId: youtube.id,
      sourceUrl: "https://www.youtube.com/watch?v=demo",
      sourceAuthor: "usuario_demo",
      sourceText: "Estoy buscando un controlador MIDI para empezar en home studio, vale la pena MidiPlus?",
      detectedBrandId: midiplus.id,
      detectedIntent: "PURCHASE_QUESTION",
      priority: "HIGH",
      notes: "Caso demo para validar el tablero inicial.",
    },
  });

  await prisma.opportunity.create({
    data: {
      channelId: instagram.id,
      sourceUrl: "https://www.instagram.com/p/demo-prestige",
      sourceAuthor: "runner_demo",
      sourceText: "Para correr 10K y evitar rozaduras conviene media caña o soquete corto?",
      detectedBrandId: prestige.id,
      detectedIntent: "PURCHASE_QUESTION",
      priority: "HIGH",
      notes: "Caso demo Prestige Running para validar multi-cliente.",
    },
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

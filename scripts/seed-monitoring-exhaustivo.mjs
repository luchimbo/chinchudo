/**
 * Seed exhaustivo de fuentes de monitoreo para PC MIDI Center.
 * TODAS las queries en español. Solo agrega fuentes nuevas (no duplica por label).
 * Ejecutar: node scripts/seed-monitoring-exhaustivo.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const P = {
  tecnico:   "Técnico / Productor",
  baterista: "Baterista de Departamento",
  kressmer:  "Trend-Setter Kressmer",
  profe:     "Profe / Madre-Padre",
  cazador:   "Cazador de Ofertas",
};

const NUEVAS = [

  // ─────────────────────────────────────────────
  // BLOQUE 1: MARCA ESPECÍFICA — Arturia
  // ─────────────────────────────────────────────
  { label: "Reddit - arturia minilab 3 opiniones",          channel: "reddit",    query: "arturia minilab 3 opiniones precio comprar",           account: P.tecnico,  limit: 15 },
  { label: "Reddit - arturia microfreak sintetizador",      channel: "reddit",    query: "arturia microfreak sintetizador vale la pena",         account: P.tecnico,  limit: 15 },
  { label: "Reddit - arturia keystep pro secuenciador",     channel: "reddit",    query: "arturia keystep pro secuenciador recomendacion",       account: P.tecnico,  limit: 15 },
  { label: "Reddit - arturia minifuse placa sonido",        channel: "reddit",    query: "arturia minifuse placa de sonido recomendacion",       account: P.tecnico,  limit: 15 },
  { label: "Reddit - arturia minifreak sintetizador",       channel: "reddit",    query: "arturia minifreak sintetizador comprar",               account: P.tecnico,  limit: 10 },
  { label: "Reddit - arturia beatstep secuenciador",        channel: "reddit",    query: "arturia beatstep secuenciador midi setup",             account: P.tecnico,  limit: 10 },
  { label: "Reddit - arturia precio argentina",             channel: "reddit",    query: "arturia precio argentina donde comprar",               account: P.cazador,  limit: 10 },
  { label: "YouTube - arturia minilab 3 review español",    channel: "youtube",   query: "arturia minilab 3 review unboxing español",            account: P.tecnico,  limit: 20 },
  { label: "YouTube - arturia microfreak review español",   channel: "youtube",   query: "arturia microfreak review tutorial español",           account: P.tecnico,  limit: 15 },
  { label: "YouTube - arturia keystep pro tutorial",        channel: "youtube",   query: "arturia keystep pro tutorial secuenciador español",    account: P.tecnico,  limit: 15 },
  { label: "YouTube - arturia minifuse setup español",      channel: "youtube",   query: "arturia minifuse setup interfaz audio español",        account: P.tecnico,  limit: 15 },
  { label: "YouTube - arturia microfreak tutorial patches", channel: "youtube",   query: "arturia microfreak tutorial sonidos patches español",  account: P.tecnico,  limit: 15 },
  { label: "YouTube - arturia minilab configurar daw",      channel: "youtube",   query: "arturia minilab configurar daw tutorial",              account: P.tecnico,  limit: 15 },
  { label: "Instagram - arturia minilab",                   channel: "instagram", query: "arturia minilab",                                      account: P.tecnico,  limit: 15 },
  { label: "Instagram - arturia microfreak",                channel: "instagram", query: "arturia microfreak",                                   account: P.tecnico,  limit: 10 },
  { label: "Instagram - arturia keystep",                   channel: "instagram", query: "arturia keystep",                                      account: P.tecnico,  limit: 10 },
  { label: "TikTok - arturia minilab 3 unboxing",          channel: "tiktok",    query: "arturia minilab 3 unboxing review",                    account: P.tecnico,  limit: 10 },
  { label: "TikTok - arturia microfreak sintetizador",     channel: "tiktok",    query: "arturia microfreak sintetizador español",              account: P.tecnico,  limit: 10 },
  { label: "X - arturia minilab 3 comprar precio",         channel: "x",         query: "arturia minilab 3 precio comprar",                     account: P.cazador,  limit: 15 },
  { label: "X - arturia microfreak opiniones",             channel: "x",         query: "arturia microfreak sintetizador opiniones",            account: P.tecnico,  limit: 10 },
  { label: "Facebook - arturia minilab 3 recomendacion",   channel: "facebook",  query: "arturia minilab 3 controlador teclado recomendacion",  account: P.tecnico,  limit: 15 },
  { label: "Facebook - arturia precio cuotas argentina",   channel: "facebook",  query: "arturia precio cuotas argentina disponible",           account: P.cazador,  limit: 15 },

  // ─────────────────────────────────────────────
  // BLOQUE 2: MARCA ESPECÍFICA — MidiPlus
  // ─────────────────────────────────────────────
  { label: "Reddit - midiplus ak490 recomendacion",        channel: "reddit",    query: "midiplus ak490 recomendacion teclado midi",            account: P.tecnico,  limit: 10 },
  { label: "Reddit - midiplus precio argentina",           channel: "reddit",    query: "midiplus precio argentina cuotas",                     account: P.cazador,  limit: 10 },
  { label: "YouTube - midiplus ak490 review español",      channel: "youtube",   query: "midiplus ak490 review español unboxing",               account: P.tecnico,  limit: 15 },
  { label: "TikTok - midiplus teclado review",             channel: "tiktok",    query: "midiplus teclado controlador review",                  account: P.tecnico,  limit: 10 },
  { label: "Facebook - midiplus teclado opiniones",        channel: "facebook",  query: "midiplus teclado midi opiniones recomendacion",        account: P.tecnico,  limit: 15 },

  // ─────────────────────────────────────────────
  // BLOQUE 3: MARCA ESPECÍFICA — Kressmer y Synido
  // ─────────────────────────────────────────────
  { label: "Reddit - kressmer piano teclado",              channel: "reddit",    query: "kressmer piano teclado opiniones recomendacion",       account: P.kressmer, limit: 10 },
  { label: "Reddit - synido teclado midi opiniones",       channel: "reddit",    query: "synido teclado midi recomendacion opiniones",          account: P.tecnico,  limit: 10 },
  { label: "YouTube - kressmer piano review unboxing",     channel: "youtube",   query: "kressmer piano teclado review unboxing español",       account: P.kressmer, limit: 15 },
  { label: "YouTube - synido teclado review comparativa",  channel: "youtube",   query: "synido teclado review comparativa español",            account: P.tecnico,  limit: 10 },
  { label: "Instagram - synido teclado piano",             channel: "instagram", query: "synido piano teclado",                                 account: P.kressmer, limit: 10 },
  { label: "TikTok - kressmer piano nuevo",                channel: "tiktok",    query: "kressmer piano teclado nuevo modelo",                  account: P.kressmer, limit: 10 },
  { label: "X - kressmer teclado lanzamiento",             channel: "x",         query: "kressmer piano teclado lanzamiento novedad",           account: P.kressmer, limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 4: POR DAW Y SOFTWARE
  // Gente que ya tiene DAW y busca controlador compatible
  // ─────────────────────────────────────────────
  { label: "Reddit - teclado midi fl studio español",      channel: "reddit",    query: "teclado midi fl studio recomendacion setup",          account: P.tecnico,  limit: 15 },
  { label: "Reddit - controlador midi ableton live",       channel: "reddit",    query: "controlador midi ableton live configurar",             account: P.tecnico,  limit: 15 },
  { label: "Reddit - teclado midi logic pro español",      channel: "reddit",    query: "teclado midi logic pro mac principiante",             account: P.tecnico,  limit: 10 },
  { label: "Reddit - teclado midi garageband español",     channel: "reddit",    query: "teclado midi garageband iphone ipad",                 account: P.profe,    limit: 10 },
  { label: "Reddit - placa de sonido home studio",         channel: "reddit",    query: "placa de sonido home studio economica cual comprar",  account: P.tecnico,  limit: 15 },
  { label: "YouTube - controlador midi fl studio tutorial",channel: "youtube",   query: "controlador midi fl studio setup tutorial español",   account: P.tecnico,  limit: 15 },
  { label: "YouTube - controlador midi ableton tutorial",  channel: "youtube",   query: "controlador midi ableton live tutorial configurar",   account: P.tecnico,  limit: 15 },
  { label: "YouTube - placa sonido home studio económica", channel: "youtube",   query: "placa de sonido home studio economica recomendacion", account: P.tecnico,  limit: 15 },
  { label: "YouTube - como grabar musica en casa",         channel: "youtube",   query: "como grabar musica en casa sin ruido economico",      account: P.tecnico,  limit: 15 },
  { label: "X - teclado midi fl studio configurar",        channel: "x",         query: "teclado midi fl studio configurar tutorial",          account: P.tecnico,  limit: 10 },
  { label: "X - controlador midi ableton setup",           channel: "x",         query: "controlador midi ableton live setup recomendacion",   account: P.tecnico,  limit: 10 },
  { label: "TikTok - setup fl studio economico midi",      channel: "tiktok",    query: "setup fl studio economico controlador midi",          account: P.tecnico,  limit: 10 },
  { label: "TikTok - home studio setup tour economico",    channel: "tiktok",    query: "home studio setup tour economico casero",             account: P.tecnico,  limit: 10 },
  { label: "Facebook - fl studio controlador midi",        channel: "facebook",  query: "fl studio controlador midi recomendacion cual usar",  account: P.tecnico,  limit: 15 },
  { label: "Instagram - home studio fl studio setup",      channel: "instagram", query: "fl studio home studio setup midi",                    account: P.tecnico,  limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 5: INTENCIÓN DE COMPRA LOCAL (Argentina)
  // ─────────────────────────────────────────────
  { label: "Reddit - donde comprar midi Argentina",        channel: "reddit",    query: "donde comprar controlador midi argentina",            account: P.cazador,  limit: 10 },
  { label: "Reddit - instrumento musical cuotas argentina",channel: "reddit",    query: "instrumento musical cuotas sin interes argentina",    account: P.cazador,  limit: 10 },
  { label: "Reddit - teclado musical mercadolibre vs tienda", channel: "reddit", query: "teclado musical mercadolibre vs tienda oficial garantia", account: P.cazador, limit: 10 },
  { label: "YouTube - donde comprar teclado midi argentina",channel: "youtube",  query: "donde comprar teclado midi argentina mejor precio",   account: P.cazador,  limit: 10 },
  { label: "X - pcmidi center",                           channel: "x",         query: "pcmidi",                                              account: "",         limit: 20 },
  { label: "X - arturia precio argentina cuotas",         channel: "x",         query: "arturia precio argentina cuotas comprar",             account: P.cazador,  limit: 15 },
  { label: "X - instrumento musical cuotas argentina",    channel: "x",         query: "instrumento musical cuotas sin interes argentina",    account: P.cazador,  limit: 10 },
  { label: "Facebook - donde comprar midi argentina",     channel: "facebook",  query: "donde comprar teclado controlador midi argentina garantia", account: P.cazador, limit: 15 },
  { label: "Instagram - pcmidi center",                   channel: "instagram", query: "pcmidi",                                              account: "",         limit: 20 },
  { label: "TikTok - controlador midi argentina precio",  channel: "tiktok",    query: "controlador midi argentina precio cuotas disponible", account: P.cazador,  limit: 10 },
  { label: "LinkedIn - arturia distribuidor argentina",   channel: "linkedin",  query: "arturia distribuidor oficial argentina",              account: "",         limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 6: MONITOREO DE COMPETIDORES
  // Cuando alguien menciona competidores hay oportunidad de entrar
  // ─────────────────────────────────────────────
  { label: "Reddit - akai mpk mini alternativa barata",   channel: "reddit",    query: "akai mpk mini alternativa mas barata recomendacion",  account: P.cazador,  limit: 15 },
  { label: "Reddit - novation launchkey comparativa",     channel: "reddit",    query: "novation launchkey alternativa comparativa precio",   account: P.tecnico,  limit: 15 },
  { label: "Reddit - korg nanokey alternativa",           channel: "reddit",    query: "korg nanokey alternativa pequeña teclado midi",       account: P.cazador,  limit: 10 },
  { label: "Reddit - focusrite scarlett alternativa",     channel: "reddit",    query: "focusrite scarlett alternativa economica placa audio", account: P.tecnico, limit: 15 },
  { label: "YouTube - akai mpk mini vs arturia minilab",  channel: "youtube",   query: "akai mpk mini vs arturia minilab comparativa español", account: P.tecnico, limit: 15 },
  { label: "YouTube - novation launchkey alternativas",   channel: "youtube",   query: "novation launchkey alternativas economicas",          account: P.tecnico,  limit: 10 },
  { label: "YouTube - focusrite vs arturia minifuse",     channel: "youtube",   query: "arturia minifuse vs focusrite scarlett comparativa",  account: P.tecnico,  limit: 10 },
  { label: "X - akai mpk mini problema falla",            channel: "x",         query: "akai mpk mini problema falla",                        account: P.tecnico,  limit: 10 },
  { label: "Facebook - akai mpk mini alternativa",        channel: "facebook",  query: "akai mpk mini alternativa economica recomendacion",   account: P.cazador,  limit: 10 },
  { label: "TikTok - akai mpk mini vs alternativa",       channel: "tiktok",    query: "akai mpk mini vs alternativa teclado midi precio",   account: P.cazador,  limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 7: PROBLEMAS Y SOPORTE TÉCNICO
  // Gente con problemas = oportunidad de ganarse confianza
  // ─────────────────────────────────────────────
  { label: "Reddit - teclado midi no funciona driver",    channel: "reddit",    query: "teclado midi no funciona driver windows instalacion", account: P.tecnico,  limit: 15 },
  { label: "Reddit - controlador midi no reconoce usb",   channel: "reddit",    query: "controlador midi no reconoce usb pc solucion",        account: P.tecnico,  limit: 15 },
  { label: "Reddit - teclado midi latencia problema",     channel: "reddit",    query: "teclado midi latencia problema como reducir",         account: P.tecnico,  limit: 15 },
  { label: "YouTube - teclado midi no funciona solucion", channel: "youtube",   query: "teclado midi no funciona solucion windows driver",    account: P.tecnico,  limit: 15 },
  { label: "X - teclado midi no funciona windows",        channel: "x",         query: "teclado midi no funciona windows driver problema",    account: P.tecnico,  limit: 10 },
  { label: "Facebook - problema teclado midi instalacion",channel: "facebook",  query: "problema teclado midi driver instalacion ayuda",      account: P.tecnico,  limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 8: CASOS DE USO — Beats, Trap, DJ
  // ─────────────────────────────────────────────
  { label: "Reddit - teclado midi produccion trap",       channel: "reddit",    query: "teclado midi produccion trap reggaeton beats casero", account: P.tecnico,  limit: 15 },
  { label: "Reddit - pad controller beatmaking mpc",      channel: "reddit",    query: "pad controller beatmaking alternativa mpc economico", account: P.tecnico,  limit: 15 },
  { label: "Reddit - controlador midi dj serato",         channel: "reddit",    query: "controlador midi dj serato traktor recomendacion",    account: P.tecnico,  limit: 15 },
  { label: "YouTube - como hacer beats teclado midi",     channel: "youtube",   query: "como hacer beats con teclado midi fl studio español", account: P.tecnico,  limit: 15 },
  { label: "YouTube - setup produccion trap economico",   channel: "youtube",   query: "setup produccion trap economico casero 2025",         account: P.tecnico,  limit: 15 },
  { label: "X - produccion musical desde cero equipos",  channel: "x",         query: "empezar produccion musical desde cero que equipo",    account: P.tecnico,  limit: 10 },
  { label: "TikTok - setup produccion trap económico",    channel: "tiktok",    query: "setup produccion trap economico home studio",         account: P.tecnico,  limit: 10 },
  { label: "Instagram - beatmaking pad drum setup",       channel: "instagram", query: "beatmaking pad drum setup home studio",               account: P.tecnico,  limit: 10 },
  { label: "Instagram - produccion musical argentina",    channel: "instagram", query: "produccion musical argentina home studio",            account: P.tecnico,  limit: 15 },
  { label: "Facebook - produccion musical argentina",     channel: "facebook",  query: "produccion musical argentina home studio setup",      account: P.tecnico,  limit: 15 },

  // ─────────────────────────────────────────────
  // BLOQUE 9: CASOS DE USO — Niños, Regalo, Adultos
  // ─────────────────────────────────────────────
  { label: "Reddit - teclado regalo musical navidad",     channel: "reddit",    query: "teclado musical regalo navidad cumpleaños cual comprar", account: P.profe,  limit: 10 },
  { label: "Reddit - teclado musical hijo aprender",      channel: "reddit",    query: "teclado musical hijo aprender musica cual comprar",   account: P.profe,    limit: 10 },
  { label: "Reddit - aprender piano adulto teclado",      channel: "reddit",    query: "aprender piano adulto teclado recomendacion",         account: P.profe,    limit: 10 },
  { label: "YouTube - regalo musical niño que comprar",   channel: "youtube",   query: "regalo musical para niño que comprar teclado",        account: P.profe,    limit: 10 },
  { label: "YouTube - como conectar teclado al celular",  channel: "youtube",   query: "como conectar teclado midi al celular iphone android", account: P.profe,   limit: 15 },
  { label: "X - regalo instrumento musical niño",         channel: "x",         query: "regalo instrumento musical niño teclado cumpleaños",  account: P.profe,    limit: 10 },
  { label: "Facebook - teclado regalo navidad niños",     channel: "facebook",  query: "teclado musical regalo navidad cumpleaños niños",     account: P.profe,    limit: 15 },
  { label: "TikTok - conectar teclado al celular",        channel: "tiktok",    query: "conectar teclado midi celular iphone android tutorial", account: P.profe,  limit: 10 },
  { label: "TikTok - regalo teclado musical niño",        channel: "tiktok",    query: "regalo teclado musical niño cumpleaños navidad",      account: P.profe,    limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 10: BATERISTA — cobertura más profunda
  // ─────────────────────────────────────────────
  { label: "Reddit - bateria electronica midi recomendacion", channel: "reddit", query: "bateria electronica midi controlador recomendacion setup", account: P.baterista, limit: 15 },
  { label: "Reddit - practica bateria departamento setup",    channel: "reddit", query: "practica bateria silenciosa departamento setup",       account: P.baterista, limit: 15 },
  { label: "Reddit - drum pad vs bateria electronica",        channel: "reddit", query: "drum pad versus bateria electronica cual elegir",      account: P.baterista, limit: 15 },
  { label: "YouTube - bateria electronica tutorial principiante", channel: "youtube", query: "bateria electronica tutorial principiante desde cero", account: P.baterista, limit: 15 },
  { label: "YouTube - drum pad review recomendacion 2025",    channel: "youtube", query: "drum pad review recomendacion 2025",                   account: P.baterista, limit: 15 },
  { label: "X - bateria electronica silencio practica",       channel: "x",      query: "bateria electronica silencio vecinos practica casa",   account: P.baterista, limit: 10 },
  { label: "Facebook - baterista departamento silencio",      channel: "facebook", query: "baterista departamento practica silenciosa setup",    account: P.baterista, limit: 15 },
  { label: "TikTok - drum pad tutorial principiante ritmo",   channel: "tiktok",  query: "drum pad tutorial principiante ritmo basico",         account: P.baterista, limit: 10 },
  { label: "Instagram - baterista departamento pads midi",    channel: "instagram", query: "baterista departamento practica midi pads",          account: P.baterista, limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 11: SINTETIZADORES
  // ─────────────────────────────────────────────
  { label: "Reddit - sintetizador barato principiante",   channel: "reddit",    query: "sintetizador barato principiante recomendacion cual",  account: P.tecnico,  limit: 15 },
  { label: "Reddit - arturia microfreak vale la pena",    channel: "reddit",    query: "arturia microfreak vale la pena comprar sintetizador", account: P.tecnico,  limit: 15 },
  { label: "Reddit - sintetizador analogico home studio", channel: "reddit",    query: "sintetizador analogico home studio recomendacion",     account: P.tecnico,  limit: 15 },
  { label: "YouTube - sintetizador recomendacion español",channel: "youtube",   query: "sintetizador recomendacion principiante español 2025", account: P.tecnico,  limit: 15 },
  { label: "X - sintetizador recomendacion precio",       channel: "x",         query: "sintetizador recomendacion precio argentina",          account: P.tecnico,  limit: 10 },
  { label: "Instagram - sintetizador setup home studio",  channel: "instagram", query: "sintetizador analogico setup home studio",             account: P.tecnico,  limit: 10 },
  { label: "TikTok - sintetizador barato recomendacion",  channel: "tiktok",    query: "sintetizador barato recomendacion principiante",       account: P.tecnico,  limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 12: INTERFAZ DE AUDIO / PLACA DE SONIDO
  // ─────────────────────────────────────────────
  { label: "Reddit - interfaz audio home studio argentina", channel: "reddit",   query: "interfaz de audio home studio economica argentina",    account: P.tecnico,  limit: 15 },
  { label: "Reddit - focusrite vs arturia minifuse",        channel: "reddit",   query: "focusrite scarlett vs arturia minifuse comparacion",   account: P.tecnico,  limit: 15 },
  { label: "YouTube - interfaz audio recomendacion español",channel: "youtube",  query: "interfaz audio economica recomendacion casera español", account: P.tecnico, limit: 15 },
  { label: "YouTube - arturia minifuse vs focusrite",       channel: "youtube",  query: "arturia minifuse vs focusrite scarlett comparativa",   account: P.tecnico,  limit: 10 },
  { label: "X - placa sonido home studio recomendacion",    channel: "x",        query: "placa de sonido home recording economica recomendacion", account: P.tecnico, limit: 10 },
  { label: "Facebook - interfaz audio home studio cual",    channel: "facebook", query: "interfaz de audio home studio cual comprar economica", account: P.tecnico,  limit: 15 },
  { label: "TikTok - placa de sonido setup grabacion",      channel: "tiktok",   query: "placa de sonido setup grabacion casera economica",    account: P.tecnico,  limit: 10 },
  { label: "Instagram - audio interface setup recording",   channel: "instagram",query: "audio interface home studio setup grabacion",          account: P.tecnico,  limit: 10 },

  // ─────────────────────────────────────────────
  // BLOQUE 13: LINKEDIN — Profesores y B2B
  // ─────────────────────────────────────────────
  { label: "LinkedIn - profesor musica tecnologia aula",   channel: "linkedin",  query: "profesor musica tecnologia aula teclado midi",         account: P.profe,    limit: 10 },
  { label: "LinkedIn - escuela musica equipamiento",       channel: "linkedin",  query: "escuela musica equipamiento tecnologia teclado",       account: P.profe,    limit: 10 },
  { label: "LinkedIn - produccion musical cursos tecnologia", channel: "linkedin", query: "produccion musical cursos tecnologia studio midi",   account: P.tecnico,  limit: 10 },

];

async function main() {
  const existing = await prisma.monitoredSource.findMany({ select: { label: true } });
  const existingLabels = new Set(existing.map((s) => s.label));

  const toInsert = NUEVAS.filter((s) => !existingLabels.has(s.label));
  const skipped  = NUEVAS.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`✓ Nada nuevo — las ${NUEVAS.length} fuentes ya existen.`);
    return;
  }

  console.log(`Insertando ${toInsert.length} fuentes nuevas (${skipped} ya existían)…\n`);

  const pcmidi = await prisma.client.findUnique({ where: { slug: "pcmidi" } });
  if (!pcmidi) throw new Error("Client 'pcmidi' not found!");

  for (const src of toInsert) {
    await prisma.monitoredSource.create({
      data: {
        label:   src.label,
        channel: src.channel,
        query:   src.query,
        account: src.account ?? "",
        limit:   src.limit ?? 15,
        active:  true,
        clientId: pcmidi.id,
      },
    });
    console.log(`  + [${src.channel.padEnd(9)}] ${src.label}`);
  }

  const total = await prisma.monitoredSource.count();
  console.log(`\n✓ Listo. Total de fuentes en la DB: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

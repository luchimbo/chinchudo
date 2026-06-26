import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const sources = [
  // ── Fuentes originales ─────────────────────────────────────────────────────
  { label: "Instagram - controlador midi",      channel: "instagram", query: "controlador midi",               account: "profe-musica",           limit: 15 },
  { label: "Instagram - home studio",           channel: "instagram", query: "home studio midi",                account: "baterista-departamento",  limit: 15 },
  { label: "X - controlador midi comprar",      channel: "x",         query: "controlador midi comprar",        account: "productor-home-studio",   limit: 20 },
  { label: "X - teclado midi precio",           channel: "x",         query: "teclado midi precio",             account: "kressmer-early",          limit: 20 },
  { label: "TikTok - controlador midi",         channel: "tiktok",    query: "controlador midi",                account: "kressmer-early",          limit: 15 },
  { label: "TikTok - drum pad bateria",         channel: "tiktok",    query: "drum pad bateria electronica",    account: "cazador-ofertas",         limit: 15 },
  { label: "Facebook - midi grupos",            channel: "facebook",  query: "midi controlador comprar",        account: "profe-musica",            limit: 15 },
  { label: "LinkedIn - produccion musical",     channel: "linkedin",  query: "produccion musical midi",         account: "productor-home-studio",   limit: 10 },
  { label: "YouTube - teclado midi",            channel: "youtube",   query: "teclado midi recomendacion",      account: "baterista-departamento",  limit: 20 },
  { label: "YouTube - drum pad home studio",    channel: "youtube",   query: "drum pad home studio",            account: "cazador-ofertas",         limit: 20 },
  { label: "Reddit - midi controller advice",   channel: "reddit",    query: "midi controller recommendation",  account: "productor-home-studio",   limit: 20 },

  // ── Fuentes nuevas: YouTube ────────────────────────────────────────────────
  { label: "YouTube - midiplus review",         channel: "youtube",   query: "midiplus review",                 account: "baterista-departamento",  limit: 15 },
  { label: "YouTube - midi keyboard principiante", channel: "youtube", query: "midi keyboard principiante",     account: "profe-musica",            limit: 15 },
  { label: "YouTube - home recording midi",     channel: "youtube",   query: "home recording setup midi",       account: "productor-home-studio",   limit: 12 },
  { label: "YouTube - arturia minilab problema", channel: "youtube",  query: "arturia minilab problema",        account: "productor-home-studio",   limit: 12 },
  { label: "YouTube - akai mpk alternativa",    channel: "youtube",   query: "akai mpk mini alternativa",       account: "productor-home-studio",   limit: 12 },

  // ── Fuentes nuevas: Reddit ─────────────────────────────────────────────────
  { label: "Reddit - controlador midi recomendacion", channel: "reddit", query: "controlador midi recomendacion", account: "productor-home-studio", limit: 15 },
  { label: "Reddit - midi keyboard setup casero", channel: "reddit",  query: "midi keyboard setup casero",      account: "profe-musica",            limit: 12 },
  { label: "Reddit - teclado midi barato",      channel: "reddit",    query: "teclado midi barato",             account: "cazador-ofertas",         limit: 12 },

  // ── Fuentes nuevas: X / Twitter ────────────────────────────────────────────
  { label: "X - teclado midi problema",         channel: "x",         query: "teclado midi problema",           account: "productor-home-studio",   limit: 15 },
  { label: "X - drum pad comprar",              channel: "x",         query: "drum pad comprar",                account: "cazador-ofertas",         limit: 15 },
  { label: "X - home studio midi setup",        channel: "x",         query: "home studio midi setup",          account: "productor-home-studio",   limit: 12 },
  { label: "X - midiplus kressmer",             channel: "x",         query: "midiplus kressmer",               account: "kressmer-early",          limit: 10 },

  // ── Fuentes nuevas: TikTok ─────────────────────────────────────────────────
  { label: "TikTok - home studio setup midi",   channel: "tiktok",    query: "home studio setup midi",          account: "productor-home-studio",   limit: 10 },
  { label: "TikTok - teclado midi recomendacion", channel: "tiktok",  query: "teclado midi recomendacion",      account: "profe-musica",            limit: 10 },

  // ── Fuentes nuevas: Instagram ──────────────────────────────────────────────
  { label: "Instagram - midiplus",              channel: "instagram", query: "midiplus",                        account: "profe-musica",            limit: 12 },
  { label: "Instagram - teclado midi setup",    channel: "instagram", query: "teclado midi setup",              account: "profe-musica",            limit: 10 },

  // ── Fuentes nuevas: Facebook ───────────────────────────────────────────────
  { label: "Facebook - teclado midi principiante", channel: "facebook", query: "teclado midi principiante",    account: "profe-musica",            limit: 10 },
  { label: "Facebook - drum pad bateria",       channel: "facebook",  query: "drum pad bateria electronica",   account: "baterista-departamento",  limit: 10 },

  // ── Fuentes nuevas: LinkedIn ───────────────────────────────────────────────
  { label: "LinkedIn - home studio midi controller", channel: "linkedin", query: "home studio setup midi controller", account: "productor-home-studio", limit: 8 },
];

const pcmidi = await prisma.client.findUnique({ where: { slug: "pcmidi" } });
if (!pcmidi) throw new Error("Client 'pcmidi' not found!");

let created = 0, skipped = 0;
for (const s of sources) {
  try {
    await prisma.monitoredSource.create({
      data: {
        ...s,
        clientId: pcmidi.id
      }
    });
    created++;
    console.log("  [OK]  " + s.label);
  } catch (e) {
    if (e.code === "P2002") { skipped++; console.log("  [--]  " + s.label + " (ya existe)"); }
    else throw e;
  }
}
console.log(`\nCreadas: ${created}  |  Ya existian: ${skipped}`);

// Actualizar limits de fuentes ya existentes en la base de datos
console.log("\nActualizando limits de fuentes existentes...");
const r1 = await prisma.monitoredSource.updateMany({
  where: { channel: { in: ["youtube", "reddit", "x"] }, limit: { lt: 20 } },
  data: { limit: 20 },
});
const r2 = await prisma.monitoredSource.updateMany({
  where: { channel: { in: ["instagram", "facebook", "tiktok"] }, limit: { lt: 15 } },
  data: { limit: 15 },
});
const r3 = await prisma.monitoredSource.updateMany({
  where: { channel: "linkedin", limit: { lt: 10 } },
  data: { limit: 10 },
});
console.log(`  youtube/reddit/x subidos a 20: ${r1.count} fuentes`);
console.log(`  instagram/facebook/tiktok subidos a 15: ${r2.count} fuentes`);
console.log(`  linkedin subidos a 10: ${r3.count} fuentes`);

await prisma.$disconnect();

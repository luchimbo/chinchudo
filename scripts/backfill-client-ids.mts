import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRESTIGE_KEYWORDS = [
  /\bmedias?\b/i,
  /\bsoquetes?\b/i,
  /\brunning\b/i,
  /\btrail\b/i,
  /\bcompresion\b/i,
  /\bcompresión\b/i,
  /\bpantorrilleras?\b/i,
  /\btermicas\b/i,
  /\btérmicas\b/i,
  /\bampollas?\b/i,
  /\bsudoracion\b/i,
  /\bsudoración\b/i,
  /\bcorrer\b/i,
  /\bropa\b/i,
];

async function main() {
  console.log("Starting client ID backfill...");

  // 1. Load clients
  const pcmidi = await prisma.client.findUnique({ where: { slug: "pcmidi" } });
  const prestige = await prisma.client.findUnique({ where: { slug: "prestige-running" } });

  if (!pcmidi || !prestige) {
    console.error("Clients 'pcmidi' and 'prestige-running' must exist in the database!");
    return;
  }

  console.log(`Loaded clients: PC MIDI (ID: ${pcmidi.id}), Prestige Running (ID: ${prestige.id})`);

  // 2. Update Monitored Sources
  const sources = await prisma.monitoredSource.findMany();
  console.log(`Found ${sources.length} monitored sources.`);

  let sourcePcmidiCount = 0;
  let sourcePrestigeCount = 0;

  for (const s of sources) {
    let targetClientId = pcmidi.id;
    const combinedText = `${s.label} ${s.query}`.toLowerCase();
    
    const isPrestige = combinedText.includes("prestige") || 
                       combinedText.includes("running") || 
                       combinedText.includes("medias") || 
                       combinedText.includes("soquetes") || 
                       combinedText.includes("trail");

    if (isPrestige) {
      targetClientId = prestige.id;
      sourcePrestigeCount++;
    } else {
      sourcePcmidiCount++;
    }

    await prisma.monitoredSource.update({
      where: { id: s.id },
      data: { clientId: targetClientId }
    });
  }

  console.log(`Updated Monitored Sources: ${sourcePcmidiCount} scoped to PC MIDI, ${sourcePrestigeCount} scoped to Prestige Running.`);

  // 3. Update Opportunities
  const opportunities = await prisma.opportunity.findMany({
    include: {
      detectedBrand: true,
      monitoredSource: true,
    }
  });

  console.log(`Found ${opportunities.length} opportunities to backfill.`);

  let opPcmidiCount = 0;
  let opPrestigeCount = 0;

  for (const op of opportunities) {
    let resolvedClientId = pcmidi.id;
    let reason = "fallback_pcmidi";

    // Trace 1: Monitored Source client (re-fetched/updated)
    let msClient = null;
    if (op.monitoredSourceId) {
      const ms = await prisma.monitoredSource.findUnique({ where: { id: op.monitoredSourceId } });
      msClient = ms?.clientId;
    }

    if (msClient) {
      resolvedClientId = msClient;
      reason = "monitored_source_client";
    } 
    // Trace 2: Brand client
    else if (op.detectedBrand?.clientId) {
      resolvedClientId = op.detectedBrand.clientId;
      reason = "brand_client";
    } 
    // Trace 3: Text content heuristics
    else {
      const text = op.sourceText;
      const matchesPrestige = PRESTIGE_KEYWORDS.some(regex => regex.test(text));
      const isAlesisPrestige = text.toLowerCase().includes("alesis") && text.toLowerCase().includes("prestige");

      if (matchesPrestige && !isAlesisPrestige) {
        resolvedClientId = prestige.id;
        reason = "keyword_match_prestige";
      }
    }

    if (resolvedClientId === prestige.id) {
      opPrestigeCount++;
    } else {
      opPcmidiCount++;
    }

    await prisma.opportunity.update({
      where: { id: op.id },
      data: { 
        clientId: resolvedClientId,
        // Also update notes with the resolution if not already noted
        notes: op.notes.includes("Cliente:") 
          ? op.notes 
          : `${op.notes} Cliente: ${resolvedClientId === prestige.id ? "prestige-running" : "pcmidi"} (Backfilled: ${reason}).`
      }
    });
  }

  console.log(`Updated Opportunities: ${opPcmidiCount} scoped to PC MIDI, ${opPrestigeCount} scoped to Prestige Running.`);
  console.log("Backfill completed successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

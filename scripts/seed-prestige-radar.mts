import { prisma } from "../src/lib/db";
// @ts-ignore -- shared operational environment loader.
import { loadEnv } from "./agent-utils.mjs";
import { PRESTIGE_RADAR_QUERIES } from "../src/lib/prestige-radar.mjs";

loadEnv();

const ACCOUNT_BY_CHANNEL: Record<string, string> = {
  // El perfil Deportista Aficionado redirige a la pantalla de cuenta suspendida
  // en Instagram. Entrenador Deportivo conserva una sesión operativa para esta red.
  instagram: "entrenador-deportivo", tiktok: "entrenador-deportivo", youtube: "deportista-aficionado",
  facebook: "entrenador-deportivo", x: "deportista-aficionado", reddit: "entrenador-deportivo",
};

async function main() {
  const prestige = await prisma.client.findUniqueOrThrow({ where: { slug: "prestige-running" } });
  await prisma.client.update({ where: { id: prestige.id }, data: { dailyOpportunityTarget: 50, dailyDraftTarget: 50 } });
  for (const source of PRESTIGE_RADAR_QUERIES) {
    const label = `Prestige · ${source.channel} · ${source.label}`;
    await prisma.monitoredSource.upsert({
      where: { label },
      update: { clientId: prestige.id, channel: source.channel, query: source.query, account: ACCOUNT_BY_CHANNEL[source.channel] ?? "", limit: 12, active: true },
      create: { clientId: prestige.id, label, channel: source.channel, query: source.query, account: ACCOUNT_BY_CHANNEL[source.channel] ?? "", limit: 12, active: true },
    });
  }
  console.log(`Prestige radar listo: ${PRESTIGE_RADAR_QUERIES.length} fuentes activas y objetivo diario de 15.`);
  await prisma.$disconnect();
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });

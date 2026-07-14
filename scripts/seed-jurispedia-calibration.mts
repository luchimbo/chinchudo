import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const examples = [
  ["Reddit", "https://calibration.local/jurispedia/reddit-laboral", "usuario_calibracion_reddit", "Me despidieron sin causa, ¿dónde puedo buscar fallos parecidos para entender qué se discutió en casos similares?"],
  ["Facebook", "https://calibration.local/jurispedia/facebook-alquileres", "usuario_calibracion_facebook", "Tengo una duda sobre alquileres, ¿hay jurisprudencia argentina para investigar el tema?"],
  ["Instagram", "https://calibration.local/jurispedia/instagram-consumo", "usuario_calibracion_instagram", "¿Dónde puedo revisar fallos de defensa del consumidor por cobros indebidos?"],
  ["TikTok", "https://calibration.local/jurispedia/tiktok-accidentes", "usuario_calibracion_tiktok", "¿Cómo busco jurisprudencia sobre daño moral por accidente de tránsito?"],
] as const;

async function main() {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "jurispedia" } });
  const brand = await prisma.brand.findUniqueOrThrow({ where: { clientId_name: { clientId: client.id, name: "Jurispedia" } } });
  for (const [channelName, sourceUrl, sourceAuthor, sourceText] of examples) {
    const channel = await prisma.channel.findUniqueOrThrow({ where: { name: channelName } });
    const existing = await prisma.opportunity.findFirst({ where: { clientId: client.id, sourceUrl } });
    if (!existing) {
      await prisma.opportunity.create({ data: { clientId: client.id, channelId: channel.id, sourceUrl, sourceAuthor, sourceText, detectedBrandId: brand.id, detectedIntent: "GENERAL_DISCUSSION", priority: "MEDIUM", notes: "Caso de calibración Jurispedia: no publicar en una red real." } });
    } else {
      await prisma.response.deleteMany({ where: { opportunityId: existing.id } });
      await prisma.opportunity.update({ where: { id: existing.id }, data: { status: "NEW", sourceText } });
    }
  }
  console.log("Casos de calibración Jurispedia listos para generar borradores.");
}

main().finally(() => prisma.$disconnect());

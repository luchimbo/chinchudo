import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const defaultConfigs = [
  {
    name: "Técnico / Productor",
    voiceId: "es-AR-TomasNeural",
    avatarUrl: "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Baterista de Departamento",
    voiceId: "es-AR-TomasNeural",
    avatarUrl: "https://images.pexels.com/photos/1043473/pexels-photo-1043473.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Trend-Setter Kressmer",
    voiceId: "es-AR-ElenaNeural",
    avatarUrl: "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Profe / Madre-Padre",
    voiceId: "es-AR-ElenaNeural",
    avatarUrl: "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Cazador de Ofertas",
    voiceId: "es-AR-TomasNeural",
    avatarUrl: "https://images.pexels.com/photos/2287252/pexels-photo-2287252.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  }
];

async function main() {
  console.log("Starting backfill of Persona voiceId and avatarUrl...");
  for (const config of defaultConfigs) {
    const result = await prisma.persona.updateMany({
      where: { name: config.name },
      data: {
        voiceId: config.voiceId,
        avatarUrl: config.avatarUrl
      }
    });
    console.log(`Updated ${result.count} Persona(s) named "${config.name}" to voiceId="${config.voiceId}"`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error backfilling personas:", err);
  process.exit(1);
});

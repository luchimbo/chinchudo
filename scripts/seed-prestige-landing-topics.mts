import { prisma } from "@/lib/db";

const topics = [
  ["cómo elegir medias deportivas para running según la distancia", "compra"],
  ["medias para correr 5K, 10K y media maratón: qué cambia", "informacional"],
  ["cómo evitar ampollas al correr: medias, humedad y ajuste", "informacional"],
  ["medias técnicas para correr con calor: qué material conviene", "informacional"],
  ["medias deportivas para entrenar en invierno: abrigo sin exceso de humedad", "informacional"],
  ["medias para trail running: qué mirar antes de salir al terreno", "compra"],
  ["medias de compresión para running: cuándo pueden servir", "informacional"],
  ["algodón o material técnico: qué elegir para correr", "informacional"],
  ["cómo elegir el talle de medias para running", "compra"],
  ["medias para correr si transpirás mucho los pies", "informacional"],
  ["qué medias usar para entrenamientos largos de running", "compra"],
  ["medias deportivas para carrera: qué probar antes del día del evento", "informacional"],
  ["cómo combinar medias y zapatillas para evitar roce al correr", "informacional"],
  ["medias para running y ampollas en los dedos: qué revisar", "informacional"],
  ["medias técnicas para running: acolchado, costuras y ventilación", "compra"],
  ["qué llevar en cuenta al comprar medias deportivas para running", "compra"],
] as const;

async function main() {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "prestige-running" }, select: { id: true } });
  const existing = await prisma.seedTopic.findMany({ where: { clientId: client.id }, select: { keyword: true } });
  const seen = new Set(existing.map((topic) => topic.keyword.trim().toLocaleLowerCase("es-AR")));
  const newTopics = topics.filter(([keyword]) => !seen.has(keyword.toLocaleLowerCase("es-AR")));

  if (newTopics.length) {
    await prisma.seedTopic.createMany({
      data: newTopics.map(([keyword, intent]) => ({ clientId: client.id, keyword, intent, suggestedCategories: [] })),
    });
  }
  console.log(JSON.stringify({ added: newTopics.length, totalBase: existing.length + newTopics.length }));
}

main().finally(() => prisma.$disconnect());

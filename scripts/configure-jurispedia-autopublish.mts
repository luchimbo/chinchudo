import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const channel = process.argv[process.argv.indexOf("--channel") + 1]?.trim().toLowerCase();
const enabled = process.argv.includes("--enable");

if (!channel || !["reddit", "facebook", "instagram", "tiktok"].includes(channel)) {
  throw new Error("Uso: npx tsx scripts/configure-jurispedia-autopublish.mts --channel reddit|facebook|instagram|tiktok --enable|--disable");
}

async function main() {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "jurispedia" } });
  await prisma.appSetting.upsert({
    where: { key: `jurispedia.autopublish.${channel}` },
    update: { value: String(enabled) },
    create: { key: `jurispedia.autopublish.${channel}`, value: String(enabled) },
  });
  await prisma.client.update({ where: { id: client.id }, data: { autoApprove: enabled, autoPublish: enabled } });
  console.log(`Jurispedia ${channel}: auto-publicación ${enabled ? "activada" : "pausada"}.`);
}

main().finally(() => prisma.$disconnect());

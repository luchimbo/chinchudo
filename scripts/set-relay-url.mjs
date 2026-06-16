// Escribe/actualiza la URL del relay en la tabla AppSetting de la DB compartida.
// El dashboard (Vercel) la lee en cada request via src/lib/settings.ts -> getRelayUrl().
// Uso: node scripts/set-relay-url.mjs <url>
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();

async function main() {
  const url = (process.argv[2] || "").trim();
  if (!url) {
    console.error("Uso: node scripts/set-relay-url.mjs <url>");
    process.exit(1);
  }

  await prisma.appSetting.upsert({
    where: { key: "AGENT_RELAY_URL" },
    update: { value: url },
    create: { key: "AGENT_RELAY_URL", value: url }
  });

  console.log(JSON.stringify({ success: true, key: "AGENT_RELAY_URL", value: url }));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ success: false, error: err?.message || String(err) }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

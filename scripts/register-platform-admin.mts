import { PrismaClient } from "@prisma/client";

const [authUserId, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();
if (!authUserId || !name) {
  console.error("Uso: npm run admin:register -- <supabase-auth-user-uuid> <nombre>");
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
  console.error("El primer argumento debe ser el UUID de auth.users.");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const profile = await prisma.platformAdminProfile.upsert({
    where: { authUserId },
    update: { name, active: true },
    create: { authUserId, name },
  });
  console.log(`Platform admin habilitado: ${profile.name} (${profile.authUserId})`);
} finally {
  await prisma.$disconnect();
}

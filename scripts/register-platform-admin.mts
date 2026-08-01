import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const emailFlag = args.indexOf("--email");
const nameFlag = args.indexOf("--name");
const uuidArg = args.find((a) => !a.startsWith("--"));

let authUserId: string | undefined;
let name: string | undefined;

if (emailFlag !== -1 && nameFlag !== -1) {
  const email = args[emailFlag + 1];
  name = args.slice(nameFlag + 1).join(" ").trim();
  if (!email || !name) {
    console.error("Uso: npm run admin:register -- --email <email> --name <nombre>");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.admin.listUsers({});
  if (error) {
    console.error("No se pudo consultar auth.users:", error.message);
    process.exit(1);
  }
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No se encontró el usuario con email ${email} en Supabase Auth.`);
    process.exit(1);
  }
  authUserId = user.id;
  console.log(`Usuario encontrado en Supabase Auth: ${email} -> ${authUserId}`);
} else if (uuidArg) {
  const uuidIndex = args.indexOf(uuidArg);
  authUserId = uuidArg;
  name = args.slice(uuidIndex + 1).join(" ").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
    console.error("El primer argumento debe ser el UUID de auth.users.");
    process.exit(1);
  }
} else {
  console.error("Uso: npm run admin:register -- <supabase-auth-user-uuid> <nombre>");
  console.error("   o: npm run admin:register -- --email <email> --name <nombre>");
  process.exit(1);
}

if (!name) {
  console.error("Falta el nombre del administrador.");
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

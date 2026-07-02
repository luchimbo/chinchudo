import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true, slug: true } });
  console.log("Clients:", clients);

  const brands = await prisma.brand.findMany({
    select: { id: true, name: true, clientId: true }
  });
  console.log("\nBrands in DB:", brands);

  const totalProducts = await prisma.product.count();
  console.log("\nTotal products in DB:", totalProducts);

  const productsWithBrand = await prisma.product.findMany({
    take: 15,
    include: { brand: true },
    orderBy: { name: "asc" }
  });
  
  console.log("\nSample Products (Up to 15):");
  productsWithBrand.forEach((p) => {
    console.log(`- [${p.brand?.name || "No Brand"}] ${p.name} (Brand ClientId: ${p.brand?.clientId})`);
  });

  await prisma.$disconnect();
}

main();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const allProducts = await prisma.product.findMany({
    include: { brand: true }
  });

  console.log(`Total Products in DB: ${allProducts.length}`);
  
  const stats = {};
  let nullBrandCount = 0;

  allProducts.forEach((p) => {
    if (!p.brand) {
      nullBrandCount++;
      return;
    }
    const clientName = p.brand.clientId ? p.brand.clientId : "NULL_CLIENT";
    const key = `${clientName} | Brand: ${p.brand.name}`;
    stats[key] = (stats[key] || 0) + 1;
  });

  console.log("\nProduct counts grouped by Client ID and Brand:");
  Object.entries(stats).forEach(([group, count]) => {
    console.log(`- ${group}: ${count} products`);
  });

  console.log(`\nProducts with NO Brand: ${nullBrandCount}`);
  
  await prisma.$disconnect();
}

main();

import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const prisma = new PrismaClient();
const CLIENT_SLUG = "pcmidi";
const JSON_PATH = join(process.cwd(), "landing-build", "data", "catalogo_engagement.json");

function detectBrand(name, rawBrand) {
  let brand = rawBrand?.trim() || "";
  if (!brand) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("arturia")) brand = "Arturia";
    else if (lowerName.includes("midiplus")) brand = "MidiPlus";
    else if (lowerName.includes("kressmer")) brand = "Kressmer";
    else if (lowerName.includes("audio technica") || lowerName.includes("audio-technica") || lowerName.includes("ath-")) brand = "Audio Technica";
    else if (lowerName.includes("alctron")) brand = "Alctron";
    else if (lowerName.includes("synido")) brand = "Synido";
    else if (lowerName.includes("meike")) brand = "Meike";
    else brand = "MidiPlus"; // default fallback
  }

  // Normalizar nombres
  if (/^midiplus$/i.test(brand)) return "MidiPlus";
  if (/^kressmer$/i.test(brand)) return "Kressmer";
  return brand;
}

const BRAND_DEFAULTS = {
  Arturia: {
    strengths: "Líder en controladores MIDI e instrumentos de software, gran robustez y calidad de construcción.",
    tone: "Profesional, técnico e informativo",
    allowedClaims: "Garantía local oficial, excelente integración con DAW, gran tacto de teclas.",
    competitorWeaknesses: "Marcas genéricas de menor calidad de construcción y sin licencias de software incluidas.",
  },
  "Audio Technica": {
    strengths: "Estándar de la industria en audio, durabilidad extrema y respuesta de frecuencia plana.",
    tone: "Profesional, preciso y claro.",
    allowedClaims: "Garantía local oficial, durabilidad profesional, sonido de alta definición.",
    competitorWeaknesses: "Auriculares comerciales con exceso de graves artificiales que colorean el sonido.",
  },
  Alctron: {
    strengths: "Accesorios profesionales robustos y accesibles para home studio.",
    tone: "Práctico y directo.",
    allowedClaims: "Excelente relación calidad-precio, durabilidad y compatibilidad universal.",
    competitorWeaknesses: "Accesorios genéricos frágiles y de materiales poco duraderos.",
  },
  Synido: {
    strengths: "Diseño innovador y gran ergonomía a precio competitivo.",
    tone: "Moderno, fresco y entusiasta.",
    allowedClaims: "Excelente relación precio-calidad, diseño fresco y moderno, fácil configuración.",
    competitorWeaknesses: "Marcas tradicionales con sobreprecio que no innovan en su diseño.",
  },
};

async function main() {
  const client = await prisma.client.findUnique({ where: { slug: CLIENT_SLUG } });
  if (!client) {
    throw new Error(`Cliente '${CLIENT_SLUG}' no encontrado en la base de datos.`);
  }

  if (!existsSync(JSON_PATH)) {
    throw new Error(`No existe el archivo de catálogo en: ${JSON_PATH}`);
  }

  console.log(`Cargando catálogo completo desde: ${JSON_PATH}`);
  const rawData = await readFile(JSON_PATH, "utf-8");
  const products = JSON.parse(rawData);

  console.log(`Leídos ${products.length} productos del catálogo completo. Sincronizando...`);

  let brandsCreated = 0;
  let productsUpserted = 0;

  for (const p of products) {
    const brandName = detectBrand(p.nombre, p.marca);

    // 1. Obtener o crear la marca
    let brand = await prisma.brand.findUnique({
      where: {
        clientId_name: {
          clientId: client.id,
          name: brandName,
        },
      },
    });

    if (!brand) {
      const defaults = BRAND_DEFAULTS[brandName] || {
        strengths: `Marca de referencia en el rubro de audio y música para ${brandName}.`,
        tone: "Natural y amigable.",
        allowedClaims: "Garantía local oficial y soporte técnico local.",
        competitorWeaknesses: "Marcas importadas genéricas sin soporte local.",
      };

      brand = await prisma.brand.create({
        data: {
          clientId: client.id,
          name: brandName,
          strengths: defaults.strengths,
          tone: defaults.tone,
          allowedClaims: defaults.allowedClaims,
          competitorWeaknesses: defaults.competitorWeaknesses,
        },
      });
      brandsCreated++;
    }

    // 2. Upsert del producto
    await prisma.product.upsert({
      where: {
        brandId_name: {
          brandId: brand.id,
          name: p.nombre,
        },
      },
      create: {
        brandId: brand.id,
        name: p.nombre,
        category: p.categoria || "General",
        description: p.descripcion || "",
      },
      update: {
        category: p.categoria || "General",
        description: p.descripcion || "",
      },
    });

    productsUpserted++;
  }

  console.log(`\nSincronización finalizada:`);
  console.log(`- Nuevas marcas creadas: ${brandsCreated}`);
  console.log(`- Productos creados/actualizados: ${productsUpserted}`);

  // Verificar recuento final
  const dbCount = await prisma.product.count({
    where: { brand: { clientId: client.id } }
  });
  console.log(`- Recuento total de productos de PC MIDI en base de datos: ${dbCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error en la ejecución:", err);
  process.exit(1);
});

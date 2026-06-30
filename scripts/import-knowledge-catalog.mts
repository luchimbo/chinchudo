import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const prisma = new PrismaClient();
const CLIENT_SLUG = "pcmidi";
const JSON_PATH = join(process.cwd(), "landing-build", "data", "productos_pcmidi.json");

function normalizeBrandName(name: string): string {
  const normalized = name.trim();
  if (/^midiplus$/i.test(normalized)) {
    return "MidiPlus";
  }
  if (/^kressmer$/i.test(normalized)) {
    return "Kressmer";
  }
  return normalized;
}

const BRAND_DEFAULTS: Record<string, { strengths: string; tone: string; allowedClaims: string; competitorWeaknesses: string }> = {
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

  console.log(`Cargando catálogo desde: ${JSON_PATH}`);
  const rawData = await readFile(JSON_PATH, "utf-8");
  const products = JSON.parse(rawData) as {
    id: string;
    nombre: string;
    marca?: string;
    modelo?: string;
    categoria_id: string;
    url?: string;
    uso?: string;
  }[];

  console.log(`Leídos ${products.length} productos. Sincronizando marcas y productos...`);

  let brandsCreated = 0;
  let productsUpserted = 0;

  for (const p of products) {
    const rawBrand = p.marca || "MidiPlus";
    const brandName = normalizeBrandName(rawBrand);

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
      console.log(`[+] Creada marca: ${brandName}`);
      brandsCreated++;
    }

    // 2. Realizar upsert del producto
    await prisma.product.upsert({
      where: {
        brandId_name: {
          brandId: brand.id,
          name: p.nombre,
        },
      },
      update: {
        category: p.categoria_id,
        description: p.uso || "",
        useCases: p.uso || "",
        warrantyNotes: "Garantía oficial y soporte técnico local.",
      },
      create: {
        id: p.id,
        brandId: brand.id,
        name: p.nombre,
        category: p.categoria_id,
        description: p.uso || "",
        useCases: p.uso || "",
        warrantyNotes: "Garantía oficial y soporte técnico local.",
      },
    });
    productsUpserted++;
  }

  console.log(`Sincronización finalizada.`);
  console.log(`- Marcas nuevas creadas: ${brandsCreated}`);
  console.log(`- Productos insertados/actualizados: ${productsUpserted}`);
}

main()
  .catch((e) => {
    console.error("Error en sincronización:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

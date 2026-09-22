import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { catalogProductSelect, loadClientCatalogIndex } from "../src/lib/product-identity";

// Catálogo completo de la tienda de PC MIDI: aporta la descripción larga de cada producto.
// Reconoce productos existentes por SKU o por nombre normalizado (mayúsculas, acentos y
// signos no cuentan), así no crea repetidos, y no pisa la categoría del catálogo curado.
// Uso: npx tsx scripts/import-engagement-catalog.mts [--dry-run]

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const CLIENT_SLUG = "pcmidi";
const JSON_PATH = join(process.cwd(), "landing-build", "data", "catalogo_engagement.json");

type EngagementProduct = { nombre: string; marca?: string; categoria?: string; sku?: string; descripcion?: string };

function detectBrand(name: string, rawBrand?: string) {
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

  console.log(`Cargando catálogo completo desde: ${JSON_PATH}`);
  const rawData = await readFile(JSON_PATH, "utf-8");
  const products = JSON.parse(rawData) as EngagementProduct[];

  console.log(`Leídos ${products.length} productos del catálogo completo. Sincronizando${dryRun ? " (simulación, no se escribe nada)" : ""}...`);

  const catalog = await loadClientCatalogIndex(prisma, client.id);
  let brandsCreated = 0;
  let productsCreated = 0;
  let productsUpdated = 0;

  for (const p of products) {
    const brandName = detectBrand(p.nombre, p.marca);

    // 1. Obtener o crear la marca ("MidiPlus" y "MIDIPLUS" son la misma)
    let brand = catalog.brands.find({ name: brandName });

    if (!brand) {
      const defaults = BRAND_DEFAULTS[brandName] || {
        strengths: `Marca de referencia en el rubro de audio y música para ${brandName}.`,
        tone: "Natural y amigable.",
        allowedClaims: "Garantía local oficial y soporte técnico local.",
        competitorWeaknesses: "Marcas importadas genéricas sin soporte local.",
      };

      brand = dryRun ? { id: `nueva-marca-${brandName}`, name: brandName } : await prisma.brand.create({
        data: {
          clientId: client.id,
          name: brandName,
          strengths: defaults.strengths,
          tone: defaults.tone,
          allowedClaims: defaults.allowedClaims,
          competitorWeaknesses: defaults.competitorWeaknesses,
        },
        select: { id: true, name: true },
      });
      catalog.brands.remember(brand);
      console.log(`[+] ${dryRun ? "Se crearía" : "Creada"} marca: ${brandName}`);
      brandsCreated++;
    }

    // 2. El mismo producto se reconoce por SKU o por nombre normalizado.
    const sku = p.sku?.trim() || null;
    const existing = catalog.products.find({ externalId: sku, name: p.nombre });
    if (existing) {
      // La tienda es la fuente de la descripción larga; la categoría normalizada del catálogo curado no se pisa.
      const data = {
        ...(p.descripcion?.trim() ? { description: p.descripcion } : {}),
        ...(!existing.category.trim() || existing.category === "General" ? { category: p.categoria || "General" } : {}),
        ...(sku && !existing.sourceExternalId ? { sourceExternalId: sku } : {}),
      };
      const updated = dryRun || Object.keys(data).length === 0
        ? { ...existing, ...data }
        : await prisma.product.update({ where: { id: existing.id }, data, select: catalogProductSelect });
      catalog.products.remember(updated);
      productsUpdated++;
    } else {
      const data = { brandId: brand.id, name: p.nombre, category: p.categoria || "General", description: p.descripcion || "", sourceExternalId: sku };
      const created = dryRun
        ? { id: `nuevo-${productsCreated}`, useCases: "", sourceType: "manual", ...data }
        : await prisma.product.create({ data, select: catalogProductSelect });
      catalog.products.remember(created);
      console.log(`[+] ${dryRun ? "Se crearía" : "Creado"} producto: ${p.nombre} (${brandName})`);
      productsCreated++;
    }
  }

  console.log(`\nSincronización finalizada${dryRun ? " (simulación)" : ""}:`);
  console.log(`- Marcas nuevas: ${brandsCreated}`);
  console.log(`- Productos nuevos: ${productsCreated}`);
  console.log(`- Productos existentes actualizados: ${productsUpdated}`);

  const dbCount = await prisma.product.count({ where: { brand: { clientId: client.id } } });
  console.log(`- Productos de PC MIDI en la base: ${dbCount}`);
}

main()
  .catch((err) => {
    console.error("Error en la ejecución:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

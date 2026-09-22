import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { catalogProductSelect, loadClientCatalogIndex } from "../src/lib/product-identity";

// Catálogo curado de PC MIDI: es la fuente de la categoría normalizada, los usos y la garantía.
// Reconoce productos y marcas existentes aunque cambien mayúsculas o acentos, así no duplica.
// Uso: npx tsx scripts/import-knowledge-catalog.mts [--dry-run]

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const CLIENT_SLUG = "pcmidi";
const JSON_PATH = join(process.cwd(), "landing-build", "data", "productos_pcmidi.json");
const WARRANTY_NOTES = "Garantía oficial y soporte técnico local.";

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

  console.log(`Leídos ${products.length} productos. Sincronizando marcas y productos${dryRun ? " (simulación, no se escribe nada)" : ""}...`);

  const catalog = await loadClientCatalogIndex(prisma, client.id);
  let brandsCreated = 0;
  let productsCreated = 0;
  let productsUpdated = 0;

  for (const p of products) {
    const rawBrand = p.marca || "MidiPlus";
    const brandName = normalizeBrandName(rawBrand);

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

    // 2. El mismo producto se reconoce por su id del catálogo o por el nombre normalizado.
    const curated = { category: p.categoria_id, useCases: p.uso || "", warrantyNotes: WARRANTY_NOTES };
    const existing = catalog.products.find({ id: p.id, name: p.nombre });
    if (existing) {
      if (existing.brandId !== brand.id) console.warn(`[!] ${existing.name} está en otra marca que ${brandName}; se actualiza sin moverlo.`);
      // Si la descripción es la ficha larga de la tienda, se conserva; solo se reemplaza la copia corta del uso.
      const replaceDescription = !existing.description.trim() || existing.description === existing.useCases;
      const data = { ...curated, ...(replaceDescription ? { description: p.uso || "" } : {}) };
      const updated = dryRun ? { ...existing, ...data } : await prisma.product.update({ where: { id: existing.id }, data, select: catalogProductSelect });
      catalog.products.remember(updated);
      productsUpdated++;
    } else {
      const data = { id: p.id, brandId: brand.id, name: p.nombre, description: p.uso || "", ...curated };
      const created = dryRun ? { ...data, sourceType: "manual", sourceExternalId: null } : await prisma.product.create({ data, select: catalogProductSelect });
      catalog.products.remember(created);
      console.log(`[+] ${dryRun ? "Se crearía" : "Creado"} producto: ${p.nombre} (${brandName})`);
      productsCreated++;
    }
  }

  console.log(`Sincronización finalizada${dryRun ? " (simulación)" : ""}.`);
  console.log(`- Marcas nuevas: ${brandsCreated}`);
  console.log(`- Productos nuevos: ${productsCreated}`);
  console.log(`- Productos existentes actualizados: ${productsUpdated}`);
}

main()
  .catch((e) => {
    console.error("Error en sincronización:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

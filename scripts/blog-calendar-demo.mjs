// Datos de ejemplo para ver el calendario editorial. Uso:
//   node scripts/blog-calendar-demo.mjs seed    -> crea ejemplos (todos borradores privados)
//   node scripts/blog-calendar-demo.mjs clean   -> los elimina
import { PrismaClient } from "@prisma/client";

const PREFIX = "ejemplo-calendario-";
const MARK = "[ejemplo]";
const prisma = new PrismaClient();

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);

const SAMPLES = [
  { date: "2026-09-28", status: "PUBLISHED", cluster: "controladores-midi", title: "Cómo elegir un controlador MIDI para Ableton", keyword: "controlador midi para ableton" },
  { date: "2026-09-29", status: "FAILED", cluster: "grabacion-en-casa", title: "Interfaz de audio para grabar voz en casa", keyword: "interfaz de audio para grabar voz", error: `${MARK} La URL pública respondió 404` },
  { date: "2026-10-01", status: "READY", cluster: "controladores-midi", title: "Pads MIDI para beatmaking: qué mirar antes de comprar", keyword: "pads midi para beatmaking" },
  { date: "2026-10-02", status: "READY", cluster: "sintetizadores", title: "Tu primer sintetizador analógico: guía práctica", keyword: "primer sintetizador analógico" },
  { date: "2026-10-03", status: "READY", cluster: "monitoreo-home-studio", title: "Monitores de estudio para cuartos chicos", keyword: "monitores de estudio para home studio" },
  { date: "2026-10-04", status: "READY", cluster: "podcast-y-streaming", title: "Micrófono para podcast: USB o XLR", keyword: "microfono para podcast" },
  { date: "2026-10-05", status: "PLANNED", note: `${MARK} Buscando un tema útil` },
  { date: "2026-10-06", status: "SKIPPED", note: `${MARK} Fecha omitida a mano` },
];

function content(sample, refs) {
  const [p1, p2] = refs.products;
  const [c1, c2] = refs.categories;
  const [g1] = refs.guides;
  const guide = g1 ? ` Si recién empezás, mirá [[g:${g1}|esta guía del blog]].` : "";
  return {
    h1: sample.title,
    seo_title: `${sample.title} | PC MIDI Center`,
    meta_description: `Criterios claros para decidir: ${sample.keyword}. Qué mirar, errores frecuentes y opciones.`,
    hero_lede: "Texto de ejemplo para probar el editor. Reemplazalo con contenido real.",
    direct_answer: `Respuesta directa de ejemplo: empezá por tu uso y tu espacio, y después compará [[c:${c1}|opciones de la categoría]].`,
    sections: [
      { h2: "Qué tener en cuenta", body: `Primer párrafo de ejemplo con un enlace a [[c:${c1}|una categoría]].

Segundo párrafo: el [[p:${p1}]] es un ejemplo de producto enlazado.` },
      { h2: "Errores frecuentes", body: `Comprar por precio sin mirar compatibilidad.${guide}` },
      { h2: "Cómo comparar", body: `Un producto con texto propio: [[p:${p2}|este modelo]]. También podés ver [[c:${c2}|otra categoría]].` },
      { h2: "Un enlace roto de ejemplo", body: "Este marcador apunta a algo que no existe: [[p:producto-inexistente|modelo viejo]]." },
    ],
    faqs: [{ q: "¿Necesito experiencia previa?", a: "Respuesta de ejemplo." }, { q: "¿Tiene garantía?", a: "Consultá en el local." }],
    brand_solution: { title: "Cómo ayuda PC MIDI Center", body: "Asesoramiento y soporte local." },
    primary_category_id: c1,
    secondary_category_ids: c2 ? [c2] : [],
    product_ids: refs.products,
    content_type: "GUIDE",
    indexing_state: "INDEX",
    cluster_slug: sample.cluster,
  };
}

async function seed() {
  const client = await prisma.client.findUnique({ where: { slug: "pcmidi" }, select: { id: true } });
  if (!client) throw new Error("No existe el cliente pcmidi");
  const clusters = new Map((await prisma.contentCluster.findMany({ where: { clientId: client.id }, select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const refs = {
    products: (await prisma.landingProduct.findMany({ where: { clientId: client.id }, select: { externalId: true }, take: 2, orderBy: { name: "asc" } })).map((p) => p.externalId),
    categories: (await prisma.landingCategory.findMany({ where: { clientId: client.id }, select: { key: true }, take: 2, orderBy: { name: "asc" } })).map((c) => c.key),
    guides: (await prisma.landing.findMany({ where: { clientId: client.id, status: "PUBLISHED", contentClusterId: { not: null } }, select: { slug: true }, take: 1 })).map((l) => l.slug),
  };
  for (const sample of SAMPLES) {
    let landingId = null;
    if (sample.cluster) {
      const landing = await prisma.landing.upsert({
        where: { clientId_slug: { clientId: client.id, slug: `${PREFIX}${sample.date}` } },
        create: {
          clientId: client.id, slug: `${PREFIX}${sample.date}`, keyword: sample.keyword, titulo: sample.title,
          htmlContent: JSON.stringify(content(sample, refs)), seoTitle: `${sample.title} | PC MIDI Center`,
          seoDescription: `Criterios claros para decidir: ${sample.keyword}. Qué mirar, errores frecuentes y opciones.`,
          status: "DRAFT", contentClusterId: clusters.get(sample.cluster) ?? null,
        },
        update: { htmlContent: JSON.stringify(content(sample, refs)) },
      });
      landingId = landing.id;
    }
    await prisma.blogPublication.upsert({
      where: { clientId_scheduledDate: { clientId: client.id, scheduledDate: day(sample.date) } },
      create: {
        clientId: client.id, scheduledDate: day(sample.date), status: sample.status, landingId,
        lastError: sample.error || sample.note || "", publishedAt: sample.status === "PUBLISHED" ? day(sample.date) : null,
      },
      update: {},
    });
  }
  console.log(`Ejemplos creados: ${SAMPLES.length}`);
}

async function clean() {
  const pubs = await prisma.blogPublication.deleteMany({ where: { OR: [{ lastError: { startsWith: MARK } }, { landing: { slug: { startsWith: PREFIX } } }] } });
  const landings = await prisma.landing.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  console.log(`Eliminados: ${pubs.count} fechas, ${landings.count} artículos de ejemplo`);
}

try {
  const command = process.argv[2];
  if (command === "seed") await seed();
  else if (command === "clean") await clean();
  else console.log("Uso: node scripts/blog-calendar-demo.mjs seed|clean");
} finally {
  await prisma.$disconnect();
}

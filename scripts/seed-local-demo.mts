import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth-crypto";

const prisma = new PrismaClient();

const demoUser = {
  email: "operador@aurora-demo.local",
  password: "Demo2026!",
  name: "Alex Demo",
};

async function main() {
  const existing = await prisma.client.findUnique({ where: { slug: "aurora-demo" } });
  if (existing) await prisma.client.delete({ where: { id: existing.id } });

  const channels = await Promise.all([
    prisma.channel.upsert({
      where: { name: "Instagram" },
      update: {},
      create: { name: "Instagram", type: "reels_comments", baseUrl: "https://instagram.com", responseStyleNotes: "Demo local" },
    }),
    prisma.channel.upsert({
      where: { name: "YouTube" },
      update: {},
      create: { name: "YouTube", type: "video_comments", baseUrl: "https://youtube.com", responseStyleNotes: "Demo local" },
    }),
    prisma.channel.upsert({
      where: { name: "Facebook" },
      update: {},
      create: { name: "Facebook", type: "groups_posts", baseUrl: "https://facebook.com", responseStyleNotes: "Demo local" },
    }),
  ]);

  const client = await prisma.client.create({
    data: {
      name: "Aurora Demo Studio",
      slug: "aurora-demo",
      description: "Cuenta ficticia de demostración local. No contiene clientes, productos ni publicaciones reales.",
      domainKeywords: JSON.stringify(["aurora", "demo", "running"]),
      responsePolicy: { demoOnly: true },
    },
  });

  const [brand, personas] = await Promise.all([
    prisma.brand.create({
      data: {
        clientId: client.id,
        name: "Nebula Run",
        strengths: "Marca ficticia para demostración visual.",
        tone: "Cercano, claro y práctico.",
        allowedClaims: "Solo contenido de demostración.",
        forbiddenClaims: "No realizar promesas comerciales reales.",
      },
    }),
    Promise.all([
      ["Práctico", "Consejos directos para uso diario."],
      ["Técnico", "Explicaciones claras y específicas."],
      ["Comercial", "Ayuda para orientar una compra."],
    ].map(([name, role]) => prisma.persona.create({
      data: { clientId: client.id, name, role, tone: "Claro y humano", goals: role, preferredLength: "Corto" },
    }))),
  ]);

  const product = await prisma.product.create({
    data: {
      brandId: brand.id,
      name: "Pulse Sock X1",
      category: "Medias técnicas",
      description: "Producto ficticio creado exclusivamente para la demostración local.",
      useCases: "Running urbano y entrenamiento.",
      stockStatus: "Demo",
      priceRange: "Demo",
    },
  });

  await prisma.user.create({
    data: {
      email: demoUser.email,
      name: demoUser.name,
      passwordHash: hashPassword(demoUser.password),
      role: "admin",
      clientId: client.id,
    },
  });

  const scenarios = [
    {
      channel: channels[0], author: "luli_corre_demo", priority: "HIGH" as const, intent: "PURCHASE_QUESTION" as const,
      text: "¿Estas medias sirven para entrenar 10K? Busco algo cómodo que no se baje.",
      drafts: [
        "Para 10K, esta opción ficticia está pensada para quedar firme sin apretar de más. Si corrés con zapatilla ajustada, conviene elegir el talle habitual.",
        "Para entrenar 10K buscamos un ajuste parejo y refuerzo en zonas de roce. En esta demo, la Pulse Sock X1 representa ese uso.",
        "Sí, para ese tipo de entrenamiento va muy bien. ¿La usarías para asfalto o también para trail?",
      ],
    },
    {
      channel: channels[1], author: "marcos_entrena_demo", priority: "MEDIUM" as const, intent: "TECHNICAL_QUESTION" as const,
      text: "¿Qué diferencia hay entre soquete y media de caña media para correr en verano?",
      drafts: [
        "El soquete deja más libre el tobillo y suele sentirse más fresco; la caña media suma cobertura y protección frente al roce del calzado.",
        "La diferencia principal es la cobertura. Para verano, elegí según el calzado, el roce que tengas y tu preferencia de ajuste.",
        "Si no tenés problemas de roce, el soquete suele ser más fresco. Para zapatillas que rozan el tobillo, la caña media puede resultar más cómoda.",
      ],
    },
    {
      channel: channels[2], author: "club_del_parque_demo", priority: "HIGH" as const, intent: "COMPARISON" as const,
      text: "¿Conviene usar medias técnicas aunque recién estoy empezando a correr?",
      drafts: [
        "Sí, incluso al empezar pueden aportar comodidad: un buen ajuste y menos roce ayudan a concentrarte en entrenar.",
        "No hace falta ir por algo complejo. Para comenzar, priorizá que no se muevan, que respiren bien y que te resulten cómodas.",
        "Si estás arrancando, una media técnica básica es una mejora práctica. La idea es que te olvides de los pies y disfrutes el entrenamiento.",
      ],
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const opportunity = await prisma.opportunity.create({
      data: {
        clientId: client.id,
        channelId: scenario.channel.id,
        sourceUrl: `https://demo.local/oportunidad/${index + 1}`,
        sourceAuthor: scenario.author,
        sourceText: scenario.text,
        detectedBrandId: brand.id,
        detectedProductId: product.id,
        detectedIntent: scenario.intent,
        priority: scenario.priority,
        opportunityScore: 82 - index * 8,
        status: "DRAFTED",
        detectedTopics: ["running", "comodidad"] as never,
        notes: "Dato generado para demo local.",
      },
    });

    await prisma.response.createMany({
      data: scenario.drafts.map((draftText, draftIndex) => ({
        opportunityId: opportunity.id,
        personaId: personas[draftIndex].id,
        brandId: brand.id,
        variantType: (["SHORT", "TECHNICAL", "CONVERSATIONAL"] as const)[draftIndex],
        draftText,
        riskNotes: "Contenido ficticio de demostración; no publicar.",
        voiceVariant: ["directa", "informativa", "cercana"][draftIndex],
      })),
    });
  }

  console.log(`Demo local lista: ${demoUser.email} / ${demoUser.password}`);
}

main().finally(() => prisma.$disconnect());

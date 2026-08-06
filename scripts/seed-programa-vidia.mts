import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const json = (items: string[]) => JSON.stringify(items);

const personas = [
  ["Técnico", "Explica los canales y el proceso de orientación sin evaluar ni indicar tratamientos.", "Claro, prudente y respetuoso.", "Orientar al contacto humano sin dar consejo clínico.", "Corta", "Proceso de primera orientación y canales de atención."],
  ["Práctico", "Acompaña a familiares con mensajes simples y no estigmatizantes.", "Cercano, calmo y concreto.", "Facilitar un primer contacto seguro y confidencial.", "Corta", "Escucha, contención y próximo paso humano."],
  ["Innovación", "Presenta recursos educativos e institucionales de Vidia sin prometer resultados.", "Moderno, sobrio y humano.", "Comunicar el enfoque de acompañamiento responsable.", "Corta", "Contenido educativo y acompañamiento familiar."],
  ["Educativo", "Aclara límites de una conversación pública y la importancia de la evaluación profesional.", "Didáctico, sereno y cuidadoso.", "Ayudar a familias a buscar orientación apropiada.", "Media", "Qué esperar de una primera orientación."],
  ["Comercial", "Deriva consultas institucionales al equipo de admisión sin presionar ni prometer disponibilidad.", "Directo, amable y no promocional.", "Convertir consultas en contacto humano informado.", "Corta", "Canales de contacto y coordinación con admisiones."],
] as const;

async function main() {
  const clientData = {
    name: "Programa Vidia",
    description: "Centro de recuperación privado para consumos problemáticos y acompañamiento familiar en Canning.",
    storeUrl: "https://programavidia.com.ar/",
    autoApprove: false,
    autoPublish: false,
    dailyOpportunityTarget: 0,
    dailyDraftTarget: 0,
    responsePolicy: {
      identity: "advisor",
      inferenceMode: "literal",
      unsupportedClaimAction: "regenerate_and_block",
      competitorMention: "never",
      competitorTone: "neutral",
    },
    domainKeywords: json([
      "consumo problemático", "adicciones", "acompañamiento familiar",
      "cómo ayudar a un familiar con adicciones", "orientación por consumo",
      "rehabilitación de adicciones", "pedir ayuda por consumo",
    ]),
    domainExclusions: json([
      "diagnóstico", "receta", "medicación", "datos clínicos", "historia clínica",
      "suicidio", "autolesión", "violencia", "sobredosis", "emergencia",
    ]),
  };
  const client = await prisma.client.upsert({
    where: { slug: "programa-vidia" },
    update: clientData,
    create: { slug: "programa-vidia", ...clientData },
  });

  const brandData = {
    clientId: client.id,
    name: "Programa Vidia",
    strengths: "Acompañamiento personalizado para personas con consumo problemático y sus familias, con un espacio cuidado y orientación profesional.",
    tone: "Humano, sereno, claro, no estigmatizante y estrictamente prudente.",
    allowedClaims: "Acompañamiento, escucha, orientación, evaluación profesional, privacidad y contacto con el equipo. Solo usar información institucional confirmada.",
    forbiddenClaims: "Diagnósticos; indicación de tratamientos, internación o medicación; promesas de recuperación; garantías de resultado; resolver urgencias en público; solicitar información clínica o personal sensible.",
    competitorWeaknesses: "",
  };
  const brand = await prisma.brand.upsert({
    where: { clientId_name: { clientId: client.id, name: "Programa Vidia" } },
    update: brandData,
    create: brandData,
  });

  for (const [name, role, tone, goals, preferredLength, angle] of personas) {
    await prisma.persona.upsert({
      where: { clientId_name: { clientId: client.id, name } },
      update: { role, tone, goals, preferredLength, angle },
      create: { clientId: client.id, name, role, tone, goals, preferredLength, angle },
    });
  }

  const knowledge = [
    ["Límite de la asistencia", "Cafishia solo prepara borradores para revisión humana. No diagnostica, no indica tratamientos ni reemplaza la evaluación del equipo profesional."],
    ["Canal de orientación", "Programa Vidia comunica atención por WhatsApp, teléfono y canales institucionales. Confirmar siempre los datos vigentes antes de publicar una respuesta."],
    ["Privacidad y casos sensibles", "No solicitar ni guardar datos clínicos en comentarios públicos. Si aparece una posible urgencia, escalar al protocolo humano y sugerir emergencias locales o servicio de guardia."],
    ["Tono institucional", "Validar la preocupación, usar lenguaje no estigmatizante y ofrecer una primera orientación humana sin ejercer presión comercial."],
  ] as const;
  await prisma.knowledgeBase.deleteMany({ where: { clientId: client.id, source: "programa-vidia-seed" } });
  await prisma.knowledgeBase.createMany({
    data: knowledge.map(([topic, content]) => ({ clientId: client.id, brandId: brand.id, topic, content, source: "programa-vidia-seed", confidence: "high" })),
  });

  const sourceSpecs = [
    ["Programa Vidia - YouTube familias", "youtube", "cómo ayudar a un familiar con adicciones"],
    ["Programa Vidia - Instagram familias", "instagram", "acompañamiento familiar consumo problemático"],
    ["Programa Vidia - Facebook orientación", "facebook", "orientación familiar consumo problemático"],
  ] as const;
  for (const [label, channel, query] of sourceSpecs) {
    await prisma.monitoredSource.upsert({
      where: { label },
      update: { clientId: client.id, channel, query, limit: 0, active: false },
      create: { clientId: client.id, label, channel, query, limit: 0, active: false },
    });
  }

  console.log("Programa Vidia listo en modo seguro: sin autoaprobación, sin autopublicación y sin fuentes activas.");
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());

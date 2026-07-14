import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const json = (value: string[]) => JSON.stringify(value);

const channels = [
  ["Reddit", "forum_threads", "https://www.reddit.com", "Contexto general; nunca asesoramiento ni datos personales."],
  ["Facebook", "groups_posts", "https://www.facebook.com", "Puede ser educativo y comunitario; evitar conclusiones sobre casos."],
  ["Instagram", "reels_comments", "https://www.instagram.com", "Respuesta breve, prudente y sin solicitar información privada."],
  ["TikTok", "short_video_comments", "https://www.tiktok.com", "Respuesta breve que invite a investigar y verificar fuentes."],
] as const;

async function main() {
  const client = await prisma.client.upsert({
    where: { slug: "jurispedia" },
    update: {
      name: "Jurispedia", autoApprove: false, autoPublish: false, storeUrl: "https://www.jurispedia.com.ar/",
      description: "Buscador gratuito de jurisprudencia argentina con fuentes oficiales; no brinda asesoramiento legal.",
      domainKeywords: json(["jurisprudencia argentina", "fallos", "despido sin causa", "cuota alimentaria", "alquileres", "accidente de transito", "defensa del consumidor", "obra social"]),
      domainExclusions: json(["urgente", "violencia", "denuncia penal", "dni", "cuil", "telefono", "domicilio"]),
    },
    create: {
      name: "Jurispedia", slug: "jurispedia", autoApprove: false, autoPublish: false, storeUrl: "https://www.jurispedia.com.ar/",
      description: "Buscador gratuito de jurisprudencia argentina con fuentes oficiales; no brinda asesoramiento legal.",
      domainKeywords: json(["jurisprudencia argentina", "fallos", "despido sin causa", "cuota alimentaria", "alquileres", "accidente de transito", "defensa del consumidor", "obra social"]),
      domainExclusions: json(["urgente", "violencia", "denuncia penal", "dni", "cuil", "telefono", "domicilio"]),
    },
  });

  const brand = await prisma.brand.upsert({
    where: { clientId_name: { clientId: client.id, name: "Jurispedia" } },
    update: {
      strengths: "Búsqueda híbrida de jurisprudencia argentina, filtros judiciales, metadatos visibles y enlaces a fuente oficial.", tone: "Claro, educativo y prudente; orientado a investigación jurídica.",
      allowedClaims: "Búsqueda en lenguaje natural; documentos con fuente oficial; filtros por jurisdicción, tribunal, sala, fuente y fecha; PDF como contexto; pedidos de búsqueda ampliada.",
      forbiddenClaims: "Asesoramiento legal; diagnóstico de casos; citas, tribunales, fechas o resultados inventados; estrategias procesales; estimación de indemnizaciones.",
    },
    create: {
      clientId: client.id, name: "Jurispedia", strengths: "Búsqueda híbrida de jurisprudencia argentina, filtros judiciales, metadatos visibles y enlaces a fuente oficial.", tone: "Claro, educativo y prudente; orientado a investigación jurídica.",
      allowedClaims: "Búsqueda en lenguaje natural; documentos con fuente oficial; filtros por jurisdicción, tribunal, sala, fuente y fecha; PDF como contexto; pedidos de búsqueda ampliada.",
      forbiddenClaims: "Asesoramiento legal; diagnóstico de casos; citas, tribunales, fechas o resultados inventados; estrategias procesales; estimación de indemnizaciones.",
    },
  });

  const personas = [
    ["Técnico", "Explica la búsqueda y filtros sin interpretar el caso.", "Preciso y prudente.", "Ayudar a investigar y verificar fuentes oficiales.", "Media", "Fuentes, filtros, metadatos y verificación."],
    ["Práctico", "Traduce la situación a una búsqueda simple y segura.", "Cercano y claro.", "Orientar sin pedir datos sensibles.", "Corta", "Búsqueda en lenguaje claro."],
    ["Innovación", "Presenta investigación jurídica asistida como apoyo.", "Moderno y sobrio.", "Mostrar capacidades verificables.", "Corta", "Búsqueda híbrida y resultados trazables."],
    ["Educativo", "Aclara límites y promueve verificar cada fallo.", "Didáctico y responsable.", "Evitar confundir la herramienta con asesoramiento.", "Media", "Fuentes oficiales y consulta profesional."],
    ["Comercial", "Invita a iniciar una búsqueda gratuita sin prometer resultados.", "Directo y no promocional.", "Llevar búsquedas calificadas a Jurispedia.", "Corta", "Acceso gratuito y búsqueda iniciada."],
  ] as const;
  for (const [name, role, tone, goals, preferredLength, angle] of personas) {
    await prisma.persona.upsert({ where: { clientId_name: { clientId: client.id, name } }, update: { role, tone, goals, preferredLength, angle }, create: { clientId: client.id, name, role, tone, goals, preferredLength, angle } });
  }

  for (const [name, type, baseUrl, responseStyleNotes] of channels) {
    await prisma.channel.upsert({ where: { name }, update: { type, baseUrl, responseStyleNotes }, create: { name, type, baseUrl, responseStyleNotes } });
  }

  const sourceSpecs = [
    ["Reddit - consultas jurisprudencia", "reddit", "jurisprudencia argentina despido alquiler alimentos accidente consumidor"],
    ["Facebook - consultas jurídicas", "facebook", "consulta legal jurisprudencia argentina"],
    ["Instagram - dudas jurídicas", "instagram", "despido alquiler alimentos defensa del consumidor"],
    ["TikTok - dudas jurídicas", "tiktok", "jurisprudencia argentina derechos laborales alquileres"],
  ] as const;
  for (const [label, channel, query] of sourceSpecs) await prisma.monitoredSource.upsert({ where: { label }, update: { clientId: client.id, channel, query, limit: 10, active: true }, create: { clientId: client.id, label, channel, query, limit: 10, active: true } });

  await prisma.knowledgeBase.deleteMany({ where: { clientId: client.id, source: "jurispedia-seed" } });
  await prisma.knowledgeBase.createMany({ data: [
    { clientId: client.id, brandId: brand.id, topic: "Límite de Jurispedia", content: "Jurispedia es una herramienta de apoyo a la investigación jurídica y no constituye asesoramiento legal. No interpretar casos, estimar resultados ni recomendar estrategias procesales.", source: "jurispedia-seed", confidence: "high" },
    { clientId: client.id, brandId: brand.id, topic: "Resultados verificables", content: "Los resultados incluyen fuente, tipo, tribunal, jurisdicción, sala, materia, fecha y enlace oficial cuando están disponibles. La IA explica relevancia, pero siempre debe verificarse el fallo completo en la fuente oficial.", source: "jurispedia-seed", confidence: "high" },
    { clientId: client.id, brandId: brand.id, topic: "Capacidades de búsqueda", content: "Permite describir un caso en lenguaje natural, filtrar por jurisdicción, año, fuente, tipo, tribunal y sala, y adjuntar PDF como contexto de búsqueda. También ofrece pedidos de búsqueda ampliada a usuarios registrados.", source: "jurispedia-seed", confidence: "high" },
  ] });

  for (const [name] of channels) await prisma.appSetting.upsert({ where: { key: `jurispedia.autopublish.${name.toLowerCase()}` }, update: {}, create: { key: `jurispedia.autopublish.${name.toLowerCase()}`, value: "false" } });
  console.log("Jurispedia listo: cliente, política de contenido, fuentes y canales en modo calibración.");
}

main().finally(() => prisma.$disconnect());

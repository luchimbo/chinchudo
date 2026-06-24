import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { intentLabels, statusLabels, type OpportunityIntentValue, type OpportunityStatusValue } from "@/lib/labels";

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export interface StatusCount { status: string; label: string; count: number }
export interface ChannelCount { channel: string; count: number }
export interface BrandCount   { brand: string;   count: number }
export interface IntentCount  { intent: string;  label: string; count: number }
export interface ProductCount { product: string; count: number }
export interface PersonaCount { persona: string; count: number }
export interface ResultCount  { result: string;  label: string; count: number }
export interface WeekPoint    { week: string; total: number; publicadas: number }

export interface AnalyticsData {
  totalOpportunities: number;
  totalResponses:     number;
  totalPublished:     number;
  totalConverted:     number;
  statusCounts:   StatusCount[];
  channelCounts:  ChannelCount[];
  brandCounts:    BrandCount[];
  intentCounts:   IntentCount[];
  productCounts:  ProductCount[];
  personaCounts:  PersonaCount[];
  resultCounts:   ResultCount[];
  weeklyTrend:    WeekPoint[];
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

const RESULT_LABELS: Record<string, string> = {
  no_reply:       "Sin respuesta",
  reply:          "Con respuesta",
  positive_reply: "Respuesta positiva",
  converted:      "Conversión",
};

const STATUS_ORDER: OpportunityStatusValue[] = [
  "NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "PUBLISHED", "FOLLOW_UP", "CONVERTED", "DISCARDED",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weekLabel(date: Date): string {
  const d = new Date(date);
  // Ajustar al lunes de esa semana
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function buildWeeklyTrend(
  opps: { createdAt: Date; status: string }[],
  weeks = 8
): WeekPoint[] {
  const now = new Date();
  const points: WeekPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    const dow = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1) - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const slice = opps.filter(o => o.createdAt >= weekStart && o.createdAt < weekEnd);
    points.push({
      week: weekLabel(weekStart),
      total: slice.length,
      publicadas: slice.filter(o => o.status === "PUBLISHED" || o.status === "CONVERTED").length,
    });
  }

  return points;
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function getAnalyticsData(clientId?: string): Promise<AnalyticsData> {
  const since8w = new Date();
  since8w.setDate(since8w.getDate() - 56);

  const oppWhere: Prisma.OpportunityWhereInput = clientId
    ? { OR: [{ detectedBrand: { clientId } }, { monitoredSource: { clientId } }] }
    : {};

  const [
    totalOpportunities,
    totalResponses,
    statusGroups,
    channelGroups,
    brandGroups,
    intentGroups,
    productGroups,
    personaGroups,
    resultGroups,
    recentOpps,
    channels,
    brands,
    personas,
  ] = await Promise.all([
    prisma.opportunity.count({ where: oppWhere }),
    prisma.response.count({ where: clientId ? { opportunity: oppWhere } : {} }),
    prisma.opportunity.groupBy({ by: ["status"],          where: oppWhere, _count: { status: true } }),
    prisma.opportunity.groupBy({ by: ["channelId"],       where: oppWhere, _count: { channelId: true } }),
    prisma.opportunity.groupBy({ by: ["detectedBrandId"], where: oppWhere, _count: { detectedBrandId: true } }),
    prisma.opportunity.groupBy({
      by: ["detectedIntent"],
      where: oppWhere,
      _count: { detectedIntent: true },
      orderBy: { _count: { detectedIntent: "desc" } },
    }),
    prisma.opportunity.groupBy({
      by: ["detectedProductId"],
      where: oppWhere,
      _count: { detectedProductId: true },
      orderBy: { _count: { detectedProductId: "desc" } },
      take: 8,
    }),
    prisma.response.groupBy({
      by: ["personaId"],
      where: clientId ? { opportunity: oppWhere } : {},
      _count: { personaId: true },
      orderBy: { _count: { personaId: "desc" } },
    }),
    prisma.publishingLog.groupBy({ by: ["result"], _count: { result: true } }),
    prisma.opportunity.findMany({
      where: { ...oppWhere, createdAt: { gte: since8w } },
      select: { createdAt: true, status: true },
    }),
    prisma.channel.findMany(),
    prisma.brand.findMany({ where: clientId ? { clientId } : {} }),
    prisma.persona.findMany({ where: clientId ? { clientId } : {} }),
  ]);

  // Lookup maps
  const channelMap = new Map(channels.map(c => [c.id, c.name]));
  const brandMap   = new Map(brands.map(b => [b.id, b.name]));
  const personaMap = new Map(personas.map(p => [p.id, p.name]));

  // Fetch product names for top products
  const productIds = productGroups
    .map(p => p.detectedProductId)
    .filter(Boolean) as string[];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
    : [];
  const productMap = new Map(products.map(p => [p.id, p.name]));

  // Derived
  const statMap = new Map(statusGroups.map(s => [s.status, s._count.status]));
  const totalPublished  = statMap.get("PUBLISHED")  ?? 0;
  const totalConverted  = statMap.get("CONVERTED")  ?? 0;

  // Status counts ordenados por pipeline
  const statusCounts: StatusCount[] = STATUS_ORDER.map(s => ({
    status: s,
    label:  statusLabels[s],
    count:  statMap.get(s) ?? 0,
  })).filter(s => s.count > 0);

  const channelCounts: ChannelCount[] = channelGroups
    .map(c => ({ channel: channelMap.get(c.channelId) ?? c.channelId, count: c._count.channelId }))
    .sort((a, b) => b.count - a.count);

  const brandCounts: BrandCount[] = brandGroups
    .filter(b => b.detectedBrandId)
    .map(b => ({ brand: brandMap.get(b.detectedBrandId!) ?? b.detectedBrandId!, count: b._count.detectedBrandId }))
    .sort((a, b) => b.count - a.count);

  const intentCounts: IntentCount[] = intentGroups.map(i => ({
    intent: i.detectedIntent,
    label:  intentLabels[i.detectedIntent as OpportunityIntentValue] ?? i.detectedIntent,
    count:  i._count.detectedIntent,
  }));

  const productCounts: ProductCount[] = productGroups
    .filter(p => p.detectedProductId)
    .map(p => ({ product: productMap.get(p.detectedProductId!) ?? p.detectedProductId!, count: p._count.detectedProductId }));

  const personaCounts: PersonaCount[] = personaGroups
    .filter(p => p.personaId)
    .map(p => ({ persona: personaMap.get(p.personaId) ?? p.personaId, count: p._count.personaId }));

  const resultCounts: ResultCount[] = resultGroups.map(r => ({
    result: r.result,
    label:  RESULT_LABELS[r.result] ?? r.result,
    count:  r._count.result,
  }));

  const weeklyTrend = buildWeeklyTrend(recentOpps);

  return {
    totalOpportunities,
    totalResponses,
    totalPublished,
    totalConverted,
    statusCounts,
    channelCounts,
    brandCounts,
    intentCounts,
    productCounts,
    personaCounts,
    resultCounts,
    weeklyTrend,
  };
}

// ─── Resumen semanal IA ───────────────────────────────────────────────────────

export async function generateWeeklySummary(
  data: AnalyticsData,
  opts?: { apiKey?: string | null; model?: string | null; clientName?: string | null },
): Promise<string> {
  // Si se pasa la config de un cliente activo, se usa esa key/modelo; si no, el .env global.
  const apiKey = opts?.apiKey?.trim() || process.env.OPENROUTER_API_KEY;
  const model  = opts?.model?.trim() || process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free";
  if (!apiKey) return "Falta API key de OpenRouter (configurala en el cliente o en .env)";

  const snapshot = `
Oportunidades totales: ${data.totalOpportunities}
Publicadas: ${data.totalPublished}
Convertidas: ${data.totalConverted}
Borradores generados: ${data.totalResponses}

Por canal:
${data.channelCounts.map(c => `  ${c.channel}: ${c.count}`).join("\n")}

Por marca:
${data.brandCounts.map(b => `  ${b.brand}: ${b.count}`).join("\n")}

Intenciones más frecuentes:
${data.intentCounts.slice(0, 5).map(i => `  ${i.label}: ${i.count}`).join("\n")}

Personas más usadas:
${data.personaCounts.slice(0, 5).map(p => `  ${p.persona}: ${p.count}`).join("\n")}

Tendencia últimas 8 semanas (semana: nuevas / publicadas):
${data.weeklyTrend.map(w => `  ${w.week}: ${w.total} nuevas, ${w.publicadas} publicadas`).join("\n")}
`.trim();

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: `Sos el analista de operaciones de ${opts?.clientName ?? "este cliente"}. Generás resúmenes semanales concisos y orientados a la acción para el equipo comercial. Escribís en español rioplatense. Sos directo, sin paja.`,
      },
      {
        role: "user",
        content: `Con estos datos del sistema, generá un resumen semanal de máximo 200 palabras. Destacá tendencias, alertas y 2 recomendaciones concretas.\n\n${snapshot}`,
      },
    ],
    max_tokens: 400,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) return `Error al generar resumen: ${res.statusText}`;
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "Sin respuesta del modelo.";
}

import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { opportunityStatuses } from "@/lib/labels";
import { operationalOpportunityWhere } from "@/lib/opportunity-channels";

const OPEN_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] as const;
const MAX_ROWS = 5000;

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

// Exporta a CSV la misma vista filtrada del listado de oportunidades.
// Mantiene el formato del export CLI (scripts/export-csv.mjs).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((c) => c.slug === sp.get("client")) ?? clients[0] ?? null;

  const statusParam = sp.get("status") ?? "";
  const validStatus = (opportunityStatuses as readonly string[]).includes(statusParam) ? statusParam : "";
  const brand = (sp.get("brand") ?? "").trim();
  const q = (sp.get("q") ?? "").trim();
  const view = sp.get("view") === "inbox" ? "inbox" : "ready";

  const where: Prisma.OpportunityWhereInput = {
    ...operationalOpportunityWhere(),
    status: { in: [...OPEN_STATUSES] },
    responses: view === "inbox" ? { none: {} } : { some: {} },
  };
  if (validStatus) where.status = validStatus as any;
  if (activeClient) where.clientId = activeClient.id;
  if (brand) where.detectedBrand = { name: brand };
  if (q) {
    where.AND = [{ OR: [{ sourceText: { contains: q } }, { sourceAuthor: { contains: q } }] }];
  }

  const rows = await prisma.opportunity.findMany({
    where,
    include: {
      channel: true,
      detectedBrand: true,
      detectedProduct: true,
      responses: {
        include: { publishingLog: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const header = [
    "createdAt",
    "status",
    "priority",
    "channel",
    "brand",
    "product",
    "intent",
    "sourceAuthor",
    "sourceUrl",
    "sourceText",
    "latestDraft",
    "publishedUrl",
    "result",
  ];

  const lines = rows.map((row) => {
    const latest = row.responses[0];
    return [
      row.createdAt.toISOString(),
      row.status,
      row.priority,
      row.channel.name,
      row.detectedBrand?.name ?? "",
      row.detectedProduct?.name ?? "",
      row.detectedIntent,
      row.sourceAuthor,
      row.sourceUrl,
      row.sourceText,
      latest?.editedText || latest?.draftText || "",
      latest?.publishingLog?.publishedUrl || "",
      latest?.publishingLog?.result || "",
    ].map(csvCell).join(",");
  });

  const csv = `${header.map(csvCell).join(",")}\n${lines.join("\n")}\n`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oportunidades-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

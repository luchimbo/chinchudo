import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const client = await resolveClientForSlug(prisma, q.get("client"));
    const text = (q.get("q") || "").slice(0, 120), kind = q.get("kind");
    const page = Math.max(1, Math.min(10_000, Math.floor(Number(q.get("page")) || 1)));
    const selected = (q.get("selected") || "").split(",").filter(Boolean).slice(0, 50);
    let items: { id: string; name: string; brand: string; category: string }[] = [], chosen: typeof items = [];
    if (kind === "cm-product") {
      const select = { id: true, name: true, brand: { select: { name: true } } };
      const [rows, saved] = await Promise.all([
        prisma.product.findMany({ where: { brand: { clientId: client.id }, ...(text ? { OR: [{ name: { contains: text, mode: "insensitive" } }, { brand: { name: { contains: text, mode: "insensitive" } } }] } : {}) }, select, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 21 }),
        selected.length ? prisma.product.findMany({ where: { id: { in: selected }, brand: { clientId: client.id } }, select }) : [],
      ]);
      const map = (r: typeof rows[number]) => ({ id: r.id, name: r.name, brand: r.brand.name, category: "" }); items = rows.map(map); chosen = saved.map(map);
    } else if (kind === "blog-product") {
      const select = { externalId: true, name: true, brand: true, categoryKey: true };
      const [rows, saved] = await Promise.all([
        prisma.$queryRaw<{ externalId: string; name: string; brand: string; categoryKey: string }[]>`SELECT "externalId", name, brand, "categoryKey" FROM "LandingProduct" WHERE "clientId" = ${client.id} AND "linkStatus" != 'missing' AND ("sourceSnapshot"->'editorialEligible') IS DISTINCT FROM 'false'::jsonb AND (name ILIKE ${`%${text}%`} OR brand ILIKE ${`%${text}%`}) ORDER BY name, id OFFSET ${(page - 1) * 20} LIMIT 21`,
        selected.length ? prisma.landingProduct.findMany({ where: { clientId: client.id, externalId: { in: selected } }, select }) : [],
      ]);
      const map = (r: typeof rows[number]) => ({ id: r.externalId, name: r.name, brand: r.brand, category: r.categoryKey }); items = rows.map(map); chosen = saved.map(map);
    } else if (kind === "blog-link") {
      const base = { clientId: client.id, status: "PUBLISHED" as const, indexingState: "INDEX" as const, contentType: { in: ["PILLAR" as const, "GUIDE" as const] } };
      const select = { id: true, titulo: true, contentCluster: { select: { name: true } } };
      const [rows, saved] = await Promise.all([
        prisma.landing.findMany({ where: { ...base, ...(text ? { titulo: { contains: text, mode: "insensitive" as const } } : {}) }, select, orderBy: [{ titulo: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 21 }),
        selected.length ? prisma.landing.findMany({ where: { ...base, id: { in: selected } }, select }) : [],
      ]);
      const map = (r: typeof rows[number]) => ({ id: r.id, name: r.titulo, brand: "", category: r.contentCluster?.name || "Sin cluster" }); items = rows.map(map); chosen = saved.map(map);
    } else return NextResponse.json({ error: "Tipo de búsqueda inválido." }, { status: 400 });
    return NextResponse.json({ items: [...new Map([...items.slice(0, 20), ...chosen].map(i => [i.id, i])).values()], hasMore: items.length > 20 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}

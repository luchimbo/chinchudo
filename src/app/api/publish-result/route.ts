import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getRelayUrl } from "@/lib/settings";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/publish-result?opportunityId=xxx
// Devuelve el resultado de una publicacion pendiente.
// Intenta leer de data/publish-results.json (local) o del relay via /result/:id (Vercel).
export async function GET(req: NextRequest) {
  const opportunityId = req.nextUrl.searchParams.get("opportunityId");
  const attemptId = req.nextUrl.searchParams.get("attemptId");
  if (!opportunityId) {
    return NextResponse.json({ error: "missing opportunityId" }, { status: 400 });
  }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { clientId: true },
  });
  if (!opportunity?.clientId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    await assertClientAccess(prisma, opportunity.clientId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // --- Path local: leer del archivo ---
  const resultsPath = join(process.cwd(), "data", "publish-results.json");
  if (existsSync(resultsPath)) {
    try {
      const all = JSON.parse(readFileSync(resultsPath, "utf-8"));
      const entry = all[attemptId || opportunityId];
      if (entry) {
        return NextResponse.json(entry);
      }
    } catch {
      // seguimos con path remoto
    }
  }

  // --- Path remoto: consultar relay ---
  const relayUrl = await getRelayUrl();
  const relayToken = process.env.AGENT_RELAY_TOKEN;
  if (relayUrl && relayToken) {
    try {
      const resultKey = encodeURIComponent(attemptId || opportunityId);
      const resp = await fetch(`${relayUrl.trim()}/result/${resultKey}`, {
        headers: { Authorization: `Bearer ${relayToken.trim()}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return NextResponse.json(data);
      }
      if (resp.status === 404) {
        return NextResponse.json({ pending: true });
      }
    } catch {
      return NextResponse.json({ pending: true });
    }
  }

  return NextResponse.json({ pending: true });
}

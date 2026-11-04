import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug, getSignedTenantClaims } from "@/lib/auth";
import { requireSession, toErrorResponse } from "@/lib/auth-guards";
import { enqueueManualJob, manualJobInput } from "@/lib/cm-manual-jobs";
import { manualCMQueue, optimizedLoading } from "@/lib/performance-flags";
import { fastManualAdmission } from "@/lib/cm-fast-admission";
import { operationTiming } from "@/lib/performance";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!manualCMQueue()) return NextResponse.json({ error: "La cola manual está desactivada." }, { status: 503 });
    const parsed = manualJobInput.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    const timing = operationTiming("cm-enqueue");
    if (optimizedLoading()) {
      const claims = await getSignedTenantClaims();
      if (claims) {
        const job = await timing.measure("authorize-and-enqueue", () => fastManualAdmission(prisma, claims, parsed.data));
        return NextResponse.json(job, { status: 202, headers: { "Cache-Control": "private, no-store", "X-Operation-Id": timing.id } });
      }
    }
    const [user, client] = await timing.measure("authentication", () => Promise.all([requireSession(), resolveClientForSlug(prisma, parsed.data.client)]));
    const job = await timing.measure("enqueue", () => enqueueManualJob(prisma, client.id, user.username, parsed.data));
    return NextResponse.json({ id: job.id, status: job.status }, { status: 202, headers: { "Cache-Control": "private, no-store", "X-Operation-Id": timing.id } });
  } catch (error) { return toErrorResponse(error); }
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const client = await resolveClientForSlug(prisma, query.get("client"));
    const jobs = await prisma.cMManualJob.findMany({ where: { clientId: client.id,
      ...(query.get("id") ? { id: query.get("id")! } : { OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { updatedAt: { gte: new Date(Date.now() - 300_000) } }] }) },
      select: { id: true, opportunityId: true, status: true, result: true, error: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 40 });
    const heartbeat = await prisma.appSetting.findUnique({ where: { key: "cm.manual.worker.heartbeat" }, select: { value: true } });
    return NextResponse.json({ jobs, workerOnline: !!heartbeat && Date.now() - Date.parse(heartbeat.value) < 30_000 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}

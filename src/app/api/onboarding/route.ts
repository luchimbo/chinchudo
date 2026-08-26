import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { analyzePublicWebsite, defaultDraft, generatedKnowledge, sanitizeDraft, syncOnboarding } from "@/lib/onboarding";

export const dynamic = "force-dynamic";
const onboardingDb = prisma as any;

async function clientForRequest() {
  const clients = await getVisibleClients(prisma);
  const client = clients[0];
  if (!client) throw new Error("No tenés un espacio de trabajo disponible.");
  return client;
}

export async function GET() {
  try {
    const client = await clientForRequest();
    const onboarding = await onboardingDb.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, draft: defaultDraft(client.name) }, update: {} });
    return NextResponse.json({ onboarding: { ...onboarding, draft: sanitizeDraft(onboarding.draft, client.name) } });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 401 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const client = await clientForRequest(); const body = await request.json();
    const existing = await onboardingDb.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, draft: defaultDraft(client.name) }, update: {} });
    const draft = sanitizeDraft({ ...(existing.draft as object), ...(body.draft as object) }, client.name);
    const currentStep = Math.max(1, Math.min(6, Number(body.currentStep) || existing.currentStep));
    const onboarding = await onboardingDb.clientOnboarding.update({ where: { clientId: client.id }, data: { draft, sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl.slice(0, 2000) : existing.sourceUrl, businessType: typeof body.businessType === "string" ? body.businessType.slice(0, 30) : existing.businessType, currentStep, status: "IN_REVIEW", analysisError: "" } });
    await syncOnboarding(prisma, client.id, draft);
    return NextResponse.json({ onboarding: { ...onboarding, draft } });
  } catch (error) { return NextResponse.json({ error: "No se pudo guardar. Revisá tu conexión e intentá de nuevo." }, { status: 400 }); }
}

export async function POST(request: NextRequest) {
  try {
    const client = await clientForRequest(); const body = await request.json();
    if (body.action === "analyze") {
      const url = String(body.url || ""); if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Ingresá una dirección web válida." }, { status: 400 });
      await onboardingDb.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, sourceUrl: url, status: "ANALYZING", draft: defaultDraft(client.name) }, update: { sourceUrl: url, status: "ANALYZING", analysisError: "" } });
      try { const draft = await analyzePublicWebsite(url, client.name); const onboarding = await onboardingDb.clientOnboarding.update({ where: { clientId: client.id }, data: { status: "IN_REVIEW", draft } }); return NextResponse.json({ onboarding: { ...onboarding, draft }, warning: draft.description ? null : "Encontramos poca información. Completá los campos que falten." }); }
      catch (error) { const onboarding = await onboardingDb.clientOnboarding.update({ where: { clientId: client.id }, data: { status: "IN_REVIEW", analysisError: (error as Error).message } }); return NextResponse.json({ onboarding: { ...onboarding, draft: sanitizeDraft(onboarding.draft, client.name) }, warning: (error as Error).message }); }
    }
    const onboarding = await onboardingDb.clientOnboarding.findUniqueOrThrow({ where: { clientId: client.id } }); const draft = sanitizeDraft(onboarding.draft, client.name);
    if (body.action === "regenerate") { const kinds = ["Problema que resolvemos", "Cómo elegir una opción", "Pregunta frecuente"]; const next = { ...draft, knowledgePrompts: kinds, knowledge: kinds.map(kind => generatedKnowledge(draft, kind)), knowledgeApproved: false }; await onboardingDb.clientOnboarding.update({ where: { clientId: client.id }, data: { draft: next } }); return NextResponse.json({ draft: next }); }
    if (body.action === "complete") { await syncOnboarding(prisma, client.id, draft); const completed = await onboardingDb.clientOnboarding.update({ where: { clientId: client.id }, data: { status: "COMPLETED", completedAt: new Date(), currentStep: 6 } }); return NextResponse.json({ onboarding: completed }); }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch { return NextResponse.json({ error: "No se pudo completar la acción. Intentá de nuevo." }, { status: 400 }); }
}

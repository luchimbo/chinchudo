/** Integration check: all temporary client data is rolled back, no IA or publication. */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { editBusinessProfile, saveAnalyzedProfile } from "../src/lib/business-analysis-service";
import { processBusinessAnalysis } from "../src/lib/business-analysis-worker";
import { sanitizeDraft } from "../src/lib/onboarding";
import type { PrismaClient } from "@prisma/client";

const slug = `codex-business-check-${randomUUID()}`;
const checks: string[] = [];
try {
  await prisma.$transaction(async tx => {
    const db = new Proxy(tx, { get(target, key) {
      if (key === "$transaction") return (callback: (inner: typeof tx) => unknown) => callback(tx);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } }) as PrismaClient;
    const client = await tx.client.create({ data: { slug, name: slug, active: false } });
    await tx.clientOnboarding.create({ data: { clientId: client.id } });
    await editBusinessProfile(db, client, { description: "Clases de música", offer: "Clases de piano", exclusions: ["promesas de resultados"] });
    const run = await tx.businessAnalysisRun.create({ data: { clientId: client.id } });
    await processBusinessAnalysis(db, run.id, { discover: async () => [], topics: async () => [] });
    const saved = await tx.businessAnalysisRun.findUniqueOrThrow({ where: { id: run.id } });
    if (saved.status !== "PARTIAL") throw new Error("La corrida no completó el perfil con pendientes.");
    const slots = await tx.blogPublication.findMany({ where: { clientId: client.id } });
    if (slots.length !== 7 || slots.some(slot => !slot.requiresApproval || slot.landingId)) throw new Error("Las reservas no permanecen privadas.");
    checks.push("contexto aplicado y siete fechas privadas con pendientes");
    await editBusinessProfile(db, client, { description: "Corrección humana" });
    await saveAnalyzedProfile(db, client, sanitizeDraft({ name: client.name, description: "Reemplazo de IA", offer: "Otra oferta" }, client.name), run.id);
    const updated = await tx.client.findUniqueOrThrow({ where: { id: client.id } });
    if (updated.description !== "Corrección humana" || !updated.domainExclusions.includes("promesas de resultados")) throw new Error("El análisis perdió una corrección.");
    if (await tx.landing.count({ where: { clientId: client.id } })) throw new Error("Se creó contenido sin temas respaldados.");
    checks.push("correcciones y exclusiones conservadas al reanalizar");
    throw new Error("ROLLBACK_BUSINESS_VERIFICATION");
  }, { timeout: 60000 });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "ROLLBACK_BUSINESS_VERIFICATION") throw error;
} finally { await prisma.$disconnect(); }
console.log(JSON.stringify({ checks, persistedChanges: 0 }));

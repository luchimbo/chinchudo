import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
// @ts-ignore shared helpers
import { nextFreeDay, withDateHistory } from "../src/lib/blog-free-slot.mjs";
// @ts-ignore shared helpers
import { withIntent } from "../src/lib/blog-intent.mjs";
nextEnv.loadEnvConfig(process.cwd());
// Mueve los artículos con fecha pasada que no se publicaron a los primeros días libres futuros.
// El worker los aprueba (control de calidad) y publica solo. Sin --apply solo muestra el plan.
const db = new PrismaClient(), apply = process.argv.includes("--apply");
const day = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: string, n: number) => day(new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400_000));
const today = process.argv.includes("--today") ? process.argv[process.argv.indexOf("--today") + 1] : day(new Date(Date.now() - 3 * 3600_000));
try {
  for (const client of await db.client.findMany({ where: { active: true } })) {
    const all = await db.blogPublication.findMany({ where: { clientId: client.id, scheduledDate: { gte: new Date("2026-10-01") } }, include: { landing: true }, orderBy: { scheduledDate: "asc" } });
    const missed = all.filter(s => day(s.scheduledDate) < today && s.landingId && ["SKIPPED", "FAILED", "READY"].includes(s.status));
    if (!missed.length) continue;
    const taken = new Set(all.filter(s => !missed.includes(s) && (s.landingId || s.status !== "PLANNED")).map(s => `${s.dailySlot}:${day(s.scheduledDate)}`));
    const planned = all.filter(s => !s.landingId && s.status === "PLANNED");
    for (const slot of missed) {
      const target = nextFreeDay({ from: shift(today, 1), isTaken: (d: string) => taken.has(`${slot.dailySlot}:${d}`) });
      // Para no pisar lo ya planificado se ocupa el primer día sin artículo.
      taken.add(`${slot.dailySlot}:${target}`);
      let intent: unknown; try { intent = JSON.parse(slot.landing!.htmlContent).editorial_intent; } catch { /* sin intención */ }
      console.log(client.slug, day(slot.scheduledDate), "->", target, slot.status, (slot.landing?.titulo ?? "").slice(0, 50));
      if (!apply) continue;
      await db.$transaction(async tx => {
        const empty = planned.find(p => p.dailySlot === slot.dailySlot && day(p.scheduledDate) === target);
        if (empty) await tx.blogPublication.deleteMany({ where: { id: empty.id, landingId: null, status: "PLANNED" } });
        await tx.blogPublication.update({ where: { id: slot.id }, data: { scheduledDate: new Date(target + "T00:00:00Z"), status: "READY", attempts: 0, lastError: "", errorCode: "", requiresApproval: true, approvedAt: null, preparation: withIntent(withDateHistory(slot.preparation, { from: day(slot.scheduledDate), to: target, reason: "missed" }), intent) } });
        await tx.landing.update({ where: { id: slot.landingId! }, data: { status: "DRAFT", publishedAt: null } });
      });
    }
  }
} finally { await db.$disconnect(); }

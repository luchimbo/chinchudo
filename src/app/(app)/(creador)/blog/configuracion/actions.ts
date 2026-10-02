"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { argentinaDate, shiftDate } from "@/lib/blog-calendar";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function updateLandingsConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const blogBaseUrl = str(formData, "blogBaseUrl");
  const storeUrl = str(formData, "storeUrl");

  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { slug: true } });
  const publishTime = str(formData, "blogPublishTime");
  const dailyEnabled = client.slug === "pcmidi" && formData.get("blogDailyEnabled") === "on";
  if (dailyEnabled && !/^https?:\/\/[^\s/]+/.test(blogBaseUrl)) throw new Error("Configurá una URL pública válida para el blog antes de activar la publicación.");
  if (dailyEnabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(publishTime)) {
    throw new Error("Indicá una hora válida para publicar cada día.");
  }
  let dailyConfig: Record<string, any> = {};
  if (client.slug === "pcmidi") {
    try { dailyConfig = JSON.parse(await getSetting(`blog_daily_schedule:${id}`) || "{}"); } catch { /* Inicialmente apagado. */ }
    // La publicación arranca al día siguiente de activarla.
    if (dailyEnabled && !dailyConfig.enabled) dailyConfig.firstPublishDate = shiftDate(argentinaDate(), 1);
  }
  await prisma.client.update({
    where: { id },
    data: {
      logoUrl: str(formData, "logoUrl"),
      storeUrl,
      blogBaseUrl,
      autoApprove: formData.get("autoApprove") === "on",
      autoPublish: formData.get("autoPublish") === "on",
    },
  });

  const intervalHours = z.coerce.number().int().min(1).max(168).parse(formData.get("generationIntervalHours"));
  const limit = z.coerce.number().int().min(1).max(5).parse(formData.get("generationLimit"));
  const weeklyTarget = z.coerce.number().int().min(2).max(10).parse(formData.get("weeklyTarget"));
  const enabled = client.slug !== "pcmidi" && formData.get("generationEnabled") === "on";
  await setSetting(`landing_generation_schedule:${id}`, JSON.stringify({ enabled, intervalHours, limit, weeklyTarget, lastRunAt: new Date().toISOString() }));

  if (client.slug === "pcmidi") {
    await setSetting(`blog_daily_schedule:${id}`, JSON.stringify({ ...dailyConfig, enabled: dailyEnabled, publishTime, timezone: "America/Argentina/Buenos_Aires", horizonDays: 14 }));
  }

  revalidatePath("/blog/configuracion");
}

export async function updateEmailConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);

  const smtpPass = str(formData, "smtpPass");

  await prisma.client.update({
    where: { id },
    data: {
      fromName: str(formData, "fromName"),
      fromEmail: str(formData, "fromEmail"),
      labName: str(formData, "labName"),
      smtpHost: str(formData, "smtpHost"),
      smtpPort: parseInt(str(formData, "smtpPort") || "465", 10) || 465,
      smtpUser: str(formData, "smtpUser"),
      unsubscribeBaseUrl: str(formData, "unsubscribeBaseUrl"),
      trackBaseUrl: str(formData, "trackBaseUrl"),
      ...(smtpPass ? { smtpPass } : {}),
    },
  });

  revalidatePath("/blog/configuracion");
}

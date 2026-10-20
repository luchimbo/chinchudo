"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { argentinaDate, shiftDate } from "@/lib/blog-calendar";
import { editorialCalendarEnabled } from "@/lib/blog-language";
import { COMPETITOR_MAX, excludedProductsKey, loadBlogCatalog, MAX_PRIORITY_COMPETITORS, priorityCompetitorsKey } from "@/lib/blog-day-plan";
import { researchBlogCompetitors } from "@/lib/blog-competitor-research";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function updateLandingsConfig(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const blogBaseUrl = str(formData, "blogBaseUrl");
  const storeUrl = str(formData, "storeUrl");

  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { slug: true, responsePolicy: true } });
  const language = formData.has("blogLanguage") ? z.enum(["es", "en", "de"]).parse(str(formData, "blogLanguage")) : undefined;
  const policy = client.responsePolicy && typeof client.responsePolicy === "object" && !Array.isArray(client.responsePolicy) ? client.responsePolicy : {};
  const blog = policy.blog && typeof policy.blog === "object" && !Array.isArray(policy.blog) ? policy.blog : {};
  const usesCalendar = editorialCalendarEnabled(client);
  const publishTime = str(formData, "blogPublishTime");
  const dailyEnabled = usesCalendar && formData.get("blogDailyEnabled") === "on";
  if (dailyEnabled && !/^https?:\/\/[^\s/]+/.test(blogBaseUrl)) throw new Error("Configurá una URL pública válida para el blog antes de activar la publicación.");
  if (dailyEnabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(publishTime)) {
    throw new Error("Indicá una hora válida para publicar cada día.");
  }
  let dailyConfig: Record<string, any> = {};
  if (usesCalendar) {
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
      ...(language ? { responsePolicy: { ...policy, blog: { ...blog, language, comparisons: formData.get("blogComparisons") === "on" } } } : {}),
      ...(usesCalendar ? {} : { autoApprove: formData.get("autoApprove") === "on", autoPublish: formData.get("autoPublish") === "on" }),
    },
  });

  const intervalHours = z.coerce.number().int().min(1).max(168).parse(formData.get("generationIntervalHours"));
  const limit = z.coerce.number().int().min(1).max(5).parse(formData.get("generationLimit"));
  const weeklyTarget = z.coerce.number().int().min(2).max(10).parse(formData.get("weeklyTarget"));
  const enabled = !usesCalendar && formData.get("generationEnabled") === "on";
  await setSetting(`landing_generation_schedule:${id}`, JSON.stringify({ enabled, intervalHours, limit, weeklyTarget, lastRunAt: new Date().toISOString() }));

  if (usesCalendar) {
    await setSetting(`blog_daily_schedule:${id}`, JSON.stringify({ ...dailyConfig, enabled: dailyEnabled, autoApprove: formData.get("blogAutoApprove") === "on", publishTime, timezone: "America/Argentina/Buenos_Aires", horizonDays: 14 }));
  }

  revalidatePath("/blog/configuracion");
  revalidatePath("/blog"); revalidatePath("/blog/articulos");
  revalidatePath("/blog/calendario");
}

/** Productos propios que ningún artículo del blog puede nombrar. */
export async function updateExcludedProducts(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const { products } = await loadBlogCatalog(prisma, id);
  const known = new Set(products.map(product => product.id));
  const excluded = [...new Set(formData.getAll("excludedProductIds").map(String).filter(value => known.has(value)))];
  await setSetting(excludedProductsKey(id), JSON.stringify(excluded));
  revalidatePath("/blog/configuracion");
  revalidatePath("/blog/calendario");
}

export async function updatePriorityCompetitors(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const raw = z.string().max(5000).parse(formData.get("competitors") ?? "");
  const names = raw.split(/\r?\n/).map(value => value.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (names.length > MAX_PRIORITY_COMPETITORS || names.some(name => name.length > COMPETITOR_MAX)) throw new Error(`Ingresá hasta ${MAX_PRIORITY_COMPETITORS} rivales de ${COMPETITOR_MAX} caracteres cada uno.`);
  const { products } = await loadBlogCatalog(prisma, id);
  const ownBrands = [...new Set(products.map(product => product.brand.toLocaleLowerCase()).filter(Boolean))];
  if (names.some(name => ownBrands.some(brand => name.toLocaleLowerCase().includes(brand)))) throw new Error("Los rivales deben ser de marcas ajenas al catálogo propio.");
  const unique = [...new Map(names.map(name => [name.toLocaleLowerCase(), name])).values()];
  await setSetting(priorityCompetitorsKey(id), JSON.stringify(unique));
  revalidatePath("/blog/configuracion");
  revalidatePath("/blog/calendario");
}

export async function discoverPriorityCompetitors(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true, openrouterApiKey: true, openrouterModel: true } });
  const products = await prisma.landingProduct.findMany({ where: { clientId: id, linkStatus: { not: "missing" } }, select: { name: true, model: true, useText: true }, take: 30 });
  if (!products.length) throw new Error("Cargá el catálogo propio antes de investigar rivales.");
  const result = await researchBlogCompetitors(client, products.map(item => ({ name: item.name, model: item.model, description: item.useText.slice(0, 400) })));
  const listKey = priorityCompetitorsKey(id), researchKey = `blog_priority_competitor_research:${id}`;
  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: listKey }, create: { key: listKey, value: JSON.stringify(result.competitors.map(item => item.name)) }, update: { value: JSON.stringify(result.competitors.map(item => item.name)) } }),
    prisma.appSetting.upsert({ where: { key: researchKey }, create: { key: researchKey, value: JSON.stringify({ at: new Date().toISOString(), model: result.model, sources: result.competitors }) }, update: { value: JSON.stringify({ at: new Date().toISOString(), model: result.model, sources: result.competitors }) } }),
  ]);
  revalidatePath("/blog/configuracion");
  revalidatePath("/blog/calendario");
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

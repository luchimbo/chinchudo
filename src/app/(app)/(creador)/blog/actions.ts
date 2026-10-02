"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { resolvePublicLandingUrl } from "@/lib/landing-html";

export async function updateLandingStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  const landing = await prisma.landing.findUniqueOrThrow({ where: { id }, select: { clientId: true, blogPublication: { select: { id: true } } } });
  await assertClientAccess(prisma, landing.clientId);
  if (landing.blogPublication) throw new Error("Administrá los artículos programados desde el calendario editorial.");
  await prisma.landing.update({
    where: { id },
    data: { status: status as any, publishedAt: status === "PUBLISHED" ? new Date() : null },
  });
  revalidatePath("/blog");
}

export async function publishLandingPreview(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const landing = await prisma.landing.findUnique({
    where: { id },
    include: {
      blogPublication: true,
      client: {
        select: {
          id: true,
          slug: true,
          blogBaseUrl: true,
        },
      },
    },
  });

  if (!landing || !landing.client) {
    throw new Error("Artículo no encontrado o sin cliente.");
  }

  await assertClientAccess(prisma, landing.client.id);
  if (landing.blogPublication) throw new Error("Los borradores del calendario son privados hasta su publicación programada.");

  if (!landing.client.blogBaseUrl.trim()) {
    throw new Error("Configurá la URL del blog del cliente antes de generar un link online.");
  }

  await prisma.landing.update({
    where: { id },
    data: {
      status: "PREVIEW_ONLINE",
      publicPreviewUrl: resolvePublicLandingUrl(landing.slug),
      previewPublishedAt: new Date(),
    },
  });

  revalidatePath("/blog");
}

export async function publishSelectedLandings(formData: FormData) {
  const ids = z.array(z.string().min(1)).parse(formData.getAll("landingId"));
  if (ids.length === 0) return;

  const landings = await prisma.landing.findMany({
    where: { id: { in: ids }, status: "PREVIEW_ONLINE", blogPublication: { is: null } },
    select: { id: true, clientId: true },
  });
  await Promise.all([...new Set(landings.map((landing) => landing.clientId))].map((clientId) => assertClientAccess(prisma, clientId)));
  await prisma.landing.updateMany({
    where: { id: { in: landings.map((landing) => landing.id) }, status: "PREVIEW_ONLINE" },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  revalidatePath("/blog");
}

export async function publishAllOnlineLandings(formData: FormData) {
  const clientId = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, clientId);
  const landings = await prisma.landing.findMany({ where: { clientId, status: "PREVIEW_ONLINE", blogPublication: { is: null } }, select: { id: true } });
  const ids = landings.map((landing) => landing.id);
  if (ids.length) {
    await prisma.landing.updateMany({ where: { id: { in: ids } }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  }
  revalidatePath("/blog");
}

// ─── Enlaces internos del blog editorial ─────────────────────────────────────
// PINNED y EXCLUDED son decisiones del operador: el recálculo automático
// (rebuild-links / cada publicación) sólo reemplaza los enlaces AUTO.

const EDITORIAL_TYPES = ["PILLAR", "GUIDE"] as const;

async function loadLinkPair(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("Un artículo no puede enlazarse a sí mismo.");
  const [source, target] = await Promise.all([
    prisma.landing.findUnique({ where: { id: sourceId }, select: { id: true, clientId: true, contentType: true } }),
    prisma.landing.findUnique({
      where: { id: targetId },
      select: { id: true, clientId: true, status: true, indexingState: true, contentType: true, titulo: true, slug: true },
    }),
  ]);
  if (!source || !target) throw new Error("Artículo no encontrado.");
  if (source.clientId !== target.clientId) throw new Error("No se pueden enlazar artículos de clientes distintos.");
  await assertClientAccess(prisma, source.clientId);
  return { source, target };
}

export async function pinInternalLink(formData: FormData) {
  const sourceId = z.string().min(1).parse(formData.get("sourceId"));
  const targetId = z.string().min(1).parse(formData.get("targetId"));
  const anchorText = z.string().trim().max(180).parse(formData.get("anchorText") ?? "");
  const { source, target } = await loadLinkPair(sourceId, targetId);
  const publishable =
    target.status === "PUBLISHED" &&
    target.indexingState === "INDEX" &&
    (EDITORIAL_TYPES as readonly string[]).includes(target.contentType);
  if (!publishable) throw new Error("Sólo se pueden fijar enlaces hacia artículos publicados e indexables.");
  const existingPinned = await prisma.landingInternalLink.count({ where: { sourceLandingId: source.id, mode: "PINNED" } });
  await prisma.landingInternalLink.upsert({
    where: { sourceLandingId_targetLandingId: { sourceLandingId: source.id, targetLandingId: target.id } },
    create: {
      clientId: source.clientId,
      sourceLandingId: source.id,
      targetLandingId: target.id,
      anchorText: anchorText || target.titulo || target.slug,
      position: existingPinned + 1,
      mode: "PINNED",
    },
    update: { mode: "PINNED", ...(anchorText ? { anchorText } : {}) },
  });
  revalidatePath("/blog");
}

export async function excludeInternalLink(formData: FormData) {
  const sourceId = z.string().min(1).parse(formData.get("sourceId"));
  const targetId = z.string().min(1).parse(formData.get("targetId"));
  const { source, target } = await loadLinkPair(sourceId, targetId);
  await prisma.landingInternalLink.upsert({
    where: { sourceLandingId_targetLandingId: { sourceLandingId: source.id, targetLandingId: target.id } },
    create: { clientId: source.clientId, sourceLandingId: source.id, targetLandingId: target.id, mode: "EXCLUDED" },
    update: { mode: "EXCLUDED" },
  });
  revalidatePath("/blog");
}

export async function resetInternalLink(formData: FormData) {
  const sourceId = z.string().min(1).parse(formData.get("sourceId"));
  const targetId = z.string().min(1).parse(formData.get("targetId"));
  const { source, target } = await loadLinkPair(sourceId, targetId);
  // Vuelve a manos del recálculo automático: el próximo rebuild decide.
  await prisma.landingInternalLink.deleteMany({
    where: { sourceLandingId: source.id, targetLandingId: target.id, mode: { in: ["PINNED", "EXCLUDED"] } },
  });
  revalidatePath("/blog");
}

export async function deleteLanding(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const landing = await prisma.landing.findUnique({
    where: { id },
    select: {
      clientId: true,
      blogPublication: { select: { id: true } },
      _count: { select: { leads: true, trackingEvents: true, distribution: true } },
    },
  });
  if (!landing) return;

  await assertClientAccess(prisma, landing.clientId);
  if (landing.blogPublication) throw new Error("Reemplazá u omití este artículo desde el calendario editorial.");
  if (landing._count.leads || landing._count.trackingEvents || landing._count.distribution) {
    throw new Error("El artículo tiene historial asociado. Archivala para conservarlo.");
  }

  await prisma.landing.delete({ where: { id } });
  revalidatePath("/blog");
}

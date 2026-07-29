"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { resolvePublicLandingUrl } from "@/lib/landing-html";

export async function updateLandingStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  await prisma.landing.update({
    where: { id },
    data: { status: status as any, publishedAt: status === "PUBLISHED" ? new Date() : null },
  });
  revalidatePath("/landings");
}

export async function publishLandingPreview(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const landing = await prisma.landing.findUnique({
    where: { id },
    include: {
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
    throw new Error("Landing no encontrada o sin cliente.");
  }

  await assertClientAccess(prisma, landing.client.id);

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

  revalidatePath("/landings");
}

export async function publishSelectedLandings(formData: FormData) {
  const ids = z.array(z.string().min(1)).parse(formData.getAll("landingId"));
  if (ids.length === 0) return;

  const landings = await prisma.landing.findMany({
    where: { id: { in: ids }, status: "PREVIEW_ONLINE" },
    select: { id: true, clientId: true },
  });
  await Promise.all([...new Set(landings.map((landing) => landing.clientId))].map((clientId) => assertClientAccess(prisma, clientId)));
  await prisma.landing.updateMany({
    where: { id: { in: landings.map((landing) => landing.id) }, status: "PREVIEW_ONLINE" },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  revalidatePath("/landings");
}

export async function publishAllOnlineLandings(formData: FormData) {
  const clientId = z.string().min(1).parse(formData.get("clientId"));
  await assertClientAccess(prisma, clientId);
  const landings = await prisma.landing.findMany({ where: { clientId, status: "PREVIEW_ONLINE" }, select: { id: true } });
  const ids = landings.map((landing) => landing.id);
  if (ids.length) {
    await prisma.landing.updateMany({ where: { id: { in: ids } }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  }
  revalidatePath("/landings");
}

export async function deleteLanding(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const landing = await prisma.landing.findUnique({
    where: { id },
    select: {
      clientId: true,
      _count: { select: { leads: true, trackingEvents: true, distribution: true } },
    },
  });
  if (!landing) return;

  await assertClientAccess(prisma, landing.clientId);
  if (landing._count.leads || landing._count.trackingEvents || landing._count.distribution) {
    throw new Error("La landing tiene historial asociado. Archivala para conservarlo.");
  }

  await prisma.landing.delete({ where: { id } });
  revalidatePath("/landings");
}

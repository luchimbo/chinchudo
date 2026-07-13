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

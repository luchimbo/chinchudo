"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

export async function updateLandingTemplate(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await assertClientAccess(prisma, id);

  const landingTemplate = String(formData.get("landingTemplate") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const landingPrimaryColor = String(formData.get("landingPrimaryColor") ?? "").trim();
  const landingSecondaryColor = String(formData.get("landingSecondaryColor") ?? "").trim();

  await prisma.client.update({
    where: { id },
    data: {
      landingTemplate,
      logoUrl,
      landingPrimaryColor,
      landingSecondaryColor,
    },
  });

  revalidatePath("/landings/editor");
}

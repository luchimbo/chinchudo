"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function updateLandingStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  await prisma.landing.update({
    where: { id },
    data: { status: status as any, publishedAt: status === "PUBLISHED" ? new Date() : undefined },
  });
  revalidatePath("/landings");
}

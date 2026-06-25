"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function approveDistribution(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.distributionPiece.update({
    where: { id },
    data: { status: "APPROVED" },
  });
  revalidatePath("/distribution");
}

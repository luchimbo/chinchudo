"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOwnedClientId } from "@/lib/auth-guards";

export async function approveDistribution(formData: FormData) {
  const id = formData.get("id") as string;
  const piece = await prisma.distributionPiece.findUniqueOrThrow({ where: { id }, select: { clientId: true } });
  await requireOwnedClientId(piece.clientId);
  await prisma.distributionPiece.update({
    where: { id },
    data: { status: "APPROVED" },
  });
  revalidatePath("/bitacora");
}

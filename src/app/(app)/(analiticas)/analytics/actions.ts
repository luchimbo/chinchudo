"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guards";

// SystemLog es global (sin clientId): borrar registros afecta a toda la
// plataforma, no a un cliente. Piso mínimo: sólo admin de tenant.

export async function deleteSystemLog(formData: FormData) {
  await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  try {
    await prisma.systemLog.delete({ where: { id } });
  } catch (error) {
    console.error("Failed to delete system log:", error);
  }
  revalidatePath("/analytics");
}

export async function clearAllSystemErrors() {
  await requireAdmin();
  try {
    await prisma.systemLog.deleteMany({ where: { level: "error" } });
  } catch (error) {
    console.error("Failed to clear system errors:", error);
  }
  revalidatePath("/analytics");
}

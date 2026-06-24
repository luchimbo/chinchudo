"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function deleteSystemLog(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  try {
    await prisma.systemLog.delete({ where: { id } });
  } catch (error) {
    console.error("Failed to delete system log:", error);
  }
  revalidatePath("/informe");
}

export async function clearAllSystemErrors() {
  try {
    await prisma.systemLog.deleteMany({ where: { level: "error" } });
  } catch (error) {
    console.error("Failed to clear system errors:", error);
  }
  revalidatePath("/informe");
}

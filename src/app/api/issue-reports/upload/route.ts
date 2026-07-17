import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase";
import { isDefaultIssueReporter } from "@/lib/auth";
import { ISSUE_IMAGE_MAX_SIZE, ISSUE_IMAGE_TYPES } from "@/lib/issue-reports";

const BUCKET = "assets";
const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(request: NextRequest) {
  if (!(await isDefaultIssueReporter())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Seleccioná una imagen." }, { status: 400 });
  if (!ISSUE_IMAGE_TYPES.includes(file.type as (typeof ISSUE_IMAGE_TYPES)[number])) {
    return NextResponse.json({ error: "Usá una imagen PNG, JPG o WEBP." }, { status: 400 });
  }
  if (file.size > ISSUE_IMAGE_MAX_SIZE) {
    return NextResponse.json({ error: "La imagen supera el límite de 5 MB." }, { status: 400 });
  }

  const path = `issue-reports/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extensions[file.type]}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}

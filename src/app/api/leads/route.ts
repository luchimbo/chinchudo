import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { captureLead } from "@/lib/nurture";
import { z } from "zod";

// El formulario del blog manda `consentimiento` (true o "true"); otros clientes `consent`.
const LeadSchema = z.object({
  email: z.string().email(),
  nombre: z.string().default(""),
  slug: z.string().min(1),
  keyword: z.string().default(""),
  client_slug: z.string().max(80).optional(),
  consent: z.union([z.boolean(), z.string()]).optional(),
  consentimiento: z.union([z.boolean(), z.string()]).optional(),
});

function truthy(value: boolean | string | undefined): boolean {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "si", "sí", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LeadSchema.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.errors[0]?.path[0];
      return NextResponse.json({ error: field === "email" ? "Email invalido" : "Datos incompletos" }, { status: 400 });
    }
    const data = parsed.data;
    const consent = truthy(data.consent) || truthy(data.consentimiento);
    if (!consent) {
      return NextResponse.json({ error: "Consentimiento requerido" }, { status: 400 });
    }

    const result = await captureLead(prisma, {
      email: data.email,
      nombre: data.nombre,
      slug: data.slug,
      keyword: data.keyword,
      consent,
      clientSlug: data.client_slug,
    });
    return NextResponse.json(
      { success: true, lead_id: result.leadId, message: result.created ? "Lead registrado" : "Lead ya existente" },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    console.error("[api/leads]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

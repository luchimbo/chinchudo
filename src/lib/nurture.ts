import { createHmac } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { PrismaClient } from "@prisma/client";
import { sendNurtureEmail } from "@/lib/mailer";

// Nurturing de leads del blog. Replica el flujo que vivía en el proyecto
// landing-enjambre (Python): al capturar el lead se envía el recurso (día 0)
// y se agenda el resto de la secuencia; el cron envía lo que vence.
// Las secuencias salen del mismo archivo que usa el build del blog.

// Rutas literales: el trazado de archivos de Next las detecta y las incluye en la función.
const LEAD_MAGNETS_FILE = path.join(process.cwd(), "landing-build/data/lead_magnets.jsonl");
const CATEGORIES_FILE = path.join(process.cwd(), "landing-build/data/categorias_pcmidi.json");
const MAX_RETRY_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export type SequenceMessage = { subject: string; body: string };
export type LeadMagnetData = {
  title?: string;
  resource_type?: string;
  nurture_sequence?: Record<string, SequenceMessage | null>;
};
type LandingContent = {
  keyword?: string;
  primary_category_id?: string;
  components?: { cat?: string; why?: string; look?: string }[];
  steps?: { t?: string; b?: string }[];
  faqs?: { q?: string }[];
};
type Category = { id: string; nombre: string; url: string };

let magnetsCache: Map<string, LeadMagnetData> | null = null;
let categoriesCache: Map<string, Category> | null = null;

export function loadLeadMagnets(file = LEAD_MAGNETS_FILE): Map<string, LeadMagnetData> {
  if (magnetsCache) return magnetsCache;
  const magnets = new Map<string, LeadMagnetData>();
  if (!fs.existsSync(file)) {
    console.error(`[nurture] No se encontró ${file}: los leads no reciben secuencia.`);
  } else {
    for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as { slug?: string; lead_magnet?: LeadMagnetData };
        if (record.slug && record.lead_magnet && !magnets.has(record.slug)) magnets.set(record.slug, record.lead_magnet);
      } catch {
        // línea corrupta: se ignora como en el flujo original
      }
    }
  }
  magnetsCache = magnets;
  return magnets;
}

function loadCategories(): Map<string, Category> {
  if (categoriesCache) return categoriesCache;
  const categories = new Map<string, Category>();
  if (fs.existsSync(CATEGORIES_FILE)) {
    for (const item of JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf-8")) as Category[]) {
      if (item.id) categories.set(item.id, item);
    }
  }
  categoriesCache = categories;
  return categories;
}

/** Pasos de la secuencia en orden de día: day_0, day_3, day_5... */
export function sequenceSteps(magnet: LeadMagnetData): { day: number; subject: string; body: string }[] {
  return Object.entries(magnet.nurture_sequence ?? {})
    .map(([key, message]) => ({ day: Number(key.replace("day_", "")), subject: message?.subject ?? "", body: message?.body ?? "" }))
    .filter((step) => Number.isFinite(step.day) && step.subject && step.body)
    .sort((a, b) => a.day - b.day);
}

/** El recurso prometido, armado con el contenido real de la landing. */
export function resourceText(magnet: LeadMagnetData, landing: LandingContent): string {
  const title = magnet.title || "Recurso PC MIDI Labs";
  const type = (magnet.resource_type || "recurso").toLowerCase();
  const components = landing.components ?? [];
  const steps = landing.steps ?? [];
  const lines = ["", "---", title];
  if (type === "checklist") {
    lines.push("Checklist practica:");
    const items = [
      ...components.slice(0, 4).map((c) => `[ ] ${c.cat || "Categoria"}: ${c.look || c.why || "Comparar segun tu caso de uso."}`),
      ...steps.slice(0, 4).map((s) => `[ ] ${s.t || "Paso recomendado"}: ${s.b || "Revisalo antes de decidir."}`),
    ];
    lines.push(
      ...(items.length
        ? items.slice(0, 8)
        : ["[ ] Defini el uso principal antes de elegir.", "[ ] Revisa conexiones, espacio disponible y compatibilidad.", "[ ] Compara categorias antes de decidir por un modelo."]),
    );
  } else if (type === "comparativa") {
    lines.push("Puntos de comparacion:");
    lines.push(...components.slice(0, 5).map((c) => `- ${c.cat || "Opcion"}: ${c.why || "Puede servir segun tu setup."} Que mirar: ${c.look || "Comparar detalles antes de elegir."}`));
  } else if (type === "mapa de decision") {
    lines.push("Mapa de decision:");
    lines.push(...steps.slice(0, 5).map((s, i) => `${i + 1}. Si estas en esta etapa: ${s.t || "Decision"}. Criterio: ${s.b || "Revisalo antes de avanzar."}`));
  } else if (type === "script") {
    lines.push("Guion de preguntas antes de comprar:");
    const questions = (landing.faqs ?? []).map((f) => f.q).filter(Boolean).slice(0, 6);
    lines.push(...(questions.length ? questions.map((q) => `- ${q}`) : ["- Que uso principal le voy a dar?", "- Que necesito conectar hoy?"]));
  } else {
    lines.push(type === "configuracion" ? "Configuracion sugerida:" : "Guia breve:");
    lines.push(...steps.slice(0, 6).map((s) => `- ${s.t || "Paso"}: ${s.b || "Aplicalo segun tu setup."}`));
  }
  lines.push("", "Si queres comparar alternativas, podes usar esta lista mientras miras opciones en pcmidi.com.ar.");
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Texto plano del email → HTML (checklists, listas, títulos), como el mailer original. */
export function bodyToHtml(bodyText: string): string {
  const parts: string[] = [];
  let list: { kind: "ul" | "ol" | "check"; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    if (list.kind === "check") {
      parts.push(`<div style="background:#fef6f1;border-left:4px solid #EB6517;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;"><ul style="list-style:none;padding:0;margin:0;">${list.items.join("")}</ul></div>`);
    } else {
      parts.push(`<${list.kind} style="padding-left:20px;margin:12px 0;">${list.items.join("")}</${list.kind}>`);
    }
    list = null;
  };
  const push = (kind: "ul" | "ol" | "check", item: string) => {
    if (!list || list.kind !== kind) {
      flush();
      list = { kind, items: [] };
    }
    list.items.push(item);
  };
  for (const raw of bodyText.split("\n")) {
    const line = raw.trim();
    if (line === "---") {
      flush();
      parts.push('<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">');
    } else if (line.startsWith("[ ] ") || line.startsWith("[x] ")) {
      const icon = line.startsWith("[x] ") ? "&#x2611;" : "&#x2610;";
      push("check", `<li style="padding:6px 0;font-size:15px;line-height:1.5;"><span style="color:#EB6517;font-size:18px;margin-right:8px;">${icon}</span><span style="color:#333;">${escapeHtml(line.slice(4))}</span></li>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      push("ul", `<li style="padding:4px 0;color:#333;">${escapeHtml(line.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      push("ol", `<li style="padding:4px 0;color:#333;">${escapeHtml(line.replace(/^\d+\.\s/, ""))}</li>`);
    } else {
      flush();
      if (!line) {
        parts.push("<br>");
        continue;
      }
      const isTitle = line.length < 80 && !/[.,!?:;]$/.test(line) && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(line) && !/^(Si |Para |Tambien |La idea )/i.test(line);
      const afterRule = parts.length === 0 || parts[parts.length - 1].startsWith("<hr");
      parts.push(
        isTitle && afterRule
          ? `<h2 style="font-size:20px;color:#1D1D1B;margin:20px 0 12px;font-weight:600;">${escapeHtml(line)}</h2>`
          : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333;">${escapeHtml(line)}</p>`,
      );
    }
  }
  flush();
  return parts.join("\n");
}

export function emailHtml(bodyText: string, opts: { unsubscribeUrl?: string; categoryUrl?: string; categoryName?: string }): string {
  const cta = opts.categoryUrl
    ? `<div style="margin:28px 0;text-align:center;"><div style="border:2px solid #EB6517;border-radius:12px;padding:24px;background:#fef6f1;">
<p style="margin:0 0 16px;font-size:16px;color:#1D1D1B;font-weight:600;">¿Querés ver modelos concretos?</p>
<p style="margin:0 0 20px;font-size:14px;color:#666;">Mirá los ${escapeHtml(opts.categoryName || "productos")} que tenemos en PC MIDI Center y compará según lo que estés buscando.</p>
<a href="${escapeHtml(opts.categoryUrl)}" style="display:inline-block;background:#EB6517;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Ver ${escapeHtml(opts.categoryName || "opciones")}</a></div></div>`
    : "";
  const unsubscribe = opts.unsubscribeUrl
    ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#888;">Si ya no querés recibir estos correos, podés <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#EB6517;">darte de baja acá</a>.</div>`
    : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#333;background:#f0f0f0;margin:0;padding:0;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:30px 10px;">
<table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#1D1D1B;padding:28px 32px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#F4F1EA;letter-spacing:2px;">PC MIDI <span style="color:#EB6517;">LABS</span></div>
<div style="font-size:12px;color:#aaa;margin-top:4px;letter-spacing:1px;">TECNOLOGIA PARA PRODUCCION MUSICAL</div></td></tr>
<tr><td style="padding:32px;">${bodyToHtml(bodyText)}${cta}</td></tr>
<tr><td style="background:#fafafa;padding:24px 32px;border-top:1px solid #eee;"><p style="font-size:13px;color:#666;margin:0;line-height:1.6;"><strong style="color:#1D1D1B;">Bruno</strong><br>
<span style="color:#888;">PC MIDI Labs - Tecnologia para produccion musical</span><br>
<a href="https://www.pcmidi.com.ar" style="color:#EB6517;text-decoration:none;">www.pcmidi.com.ar</a><br>
<a href="mailto:lab@pcmidicenter.com" style="color:#EB6517;text-decoration:none;">lab@pcmidicenter.com</a></p>${unsubscribe}</td></tr>
</table></td></tr></table></body></html>`;
}

function trackingSecret(): string {
  return process.env.NURTURE_UNSUBSCRIBE_SECRET || process.env.NURTURE_SMTP_PASS || "";
}

/** Mismo HMAC que valida /api/unsubscribe. */
export function unsubscribeUrl(email: string): string {
  const base = (process.env.NURTURE_UNSUBSCRIBE_BASE_URL || "").trim();
  const secret = process.env.NURTURE_UNSUBSCRIBE_SECRET || "";
  if (!base || !secret) return "";
  const token = createHmac("sha256", secret).update(email).digest("hex");
  return `${base.replace(/\/$/, "")}?${new URLSearchParams({ email, token })}`;
}

/** Mismo HMAC que valida /api/click. */
export function trackedUrl(url: string, leadId: string, slug: string, day: number): string {
  const secret = trackingSecret();
  const explicit = (process.env.NURTURE_TRACK_BASE_URL || "").trim();
  const base = explicit || (() => {
    try {
      return new URL(process.env.NURTURE_UNSUBSCRIBE_BASE_URL || "").origin;
    } catch {
      return "";
    }
  })();
  if (!url || !secret || !base) return url;
  const token = createHmac("sha256", secret).update(`${leadId}|${slug}|${day}|${url}`).digest("hex");
  return `${base.replace(/\/$/, "")}/api/click?${new URLSearchParams({ lead_id: leadId, slug, day: String(day), url, token })}`;
}

function personalize(body: string, nombre: string): string {
  if (!nombre) return body;
  return body.replace("¡Hola!", `¡Hola ${nombre}!`).replace("Hola de nuevo", `Hola de nuevo ${nombre}`);
}

type StepToSend = {
  id: string;
  stepDay: number;
  subject: string;
  bodyHtml: string;
  lead: { id: string; email: string; nombre: string; slug: string; keyword: string };
};

async function landingContent(prisma: PrismaClient, slug: string, clientId: string | null): Promise<LandingContent> {
  const landing = await prisma.landing.findFirst({ where: { slug, ...(clientId ? { clientId } : {}) }, select: { htmlContent: true, keyword: true } });
  try {
    return { keyword: landing?.keyword, ...(JSON.parse(landing?.htmlContent || "{}") as LandingContent) };
  } catch {
    return { keyword: landing?.keyword };
  }
}

/** Envía un paso. `bodyHtml` guarda el texto de la secuencia; el HTML se arma al enviar. */
async function deliverStep(prisma: PrismaClient, step: StepToSend, content: LandingContent): Promise<boolean> {
  const category = loadCategories().get(content.primary_category_id || "");
  const text = personalize(step.bodyHtml, step.lead.nombre);
  const unsubscribe = unsubscribeUrl(step.lead.email);
  const html = emailHtml(text, {
    unsubscribeUrl: unsubscribe,
    categoryUrl: category ? trackedUrl(category.url, step.lead.id, step.lead.slug, step.stepDay) : "",
    categoryName: category?.nombre,
  });
  const plain = unsubscribe ? `${text.trimEnd()}\n\nSi ya no querés recibir estos correos, podés darte de baja acá: ${unsubscribe}` : text;
  const ok = await sendNurtureEmail({ to: step.lead.email, subject: step.subject, html, text: plain });
  await prisma.nurtureStep.update({ where: { id: step.id }, data: ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED" } });
  return ok;
}

export type CaptureInput = { email: string; nombre: string; slug: string; keyword: string; consent: boolean; clientSlug?: string };

/**
 * Registra el lead, agenda su secuencia y envía el recurso (día 0).
 * Un email ya registrado para el cliente no se duplica ni recibe la secuencia otra vez.
 */
export async function captureLead(prisma: PrismaClient, input: CaptureInput): Promise<{ leadId: string; created: boolean; sent: boolean }> {
  const email = input.email.trim().toLowerCase();
  const client = input.clientSlug ? await prisma.client.findUnique({ where: { slug: input.clientSlug }, select: { id: true } }) : null;
  const landing = await prisma.landing.findFirst({
    where: { slug: input.slug, ...(client?.id ? { clientId: client.id } : {}) },
    select: { id: true, clientId: true, leadMagnetId: true },
  });
  const clientId = landing?.clientId ?? client?.id ?? null;
  const existing = await prisma.lead.findFirst({ where: { email, ...(clientId ? { clientId } : {}) }, select: { id: true } });
  if (existing) return { leadId: existing.id, created: false, sent: false };

  const lead = await prisma.lead.create({
    data: {
      email,
      nombre: input.nombre.trim(),
      slug: input.slug,
      keyword: input.keyword,
      consent: input.consent,
      landingId: landing?.id,
      leadMagnetId: landing?.leadMagnetId ?? undefined,
      ...(clientId ? { clientId } : {}),
    },
  });

  const magnet = loadLeadMagnets().get(input.slug);
  const steps = magnet ? sequenceSteps(magnet) : [];
  if (!magnet || !steps.length) return { leadId: lead.id, created: true, sent: false };

  const content = await landingContent(prisma, input.slug, clientId);
  const now = Date.now();
  let sent = false;
  for (const step of steps) {
    const body = step.day === 0 ? `${step.body.trimEnd()}\n${resourceText(magnet, content)}` : step.body;
    const created = await prisma.nurtureStep.create({
      data: { leadId: lead.id, clientId, stepDay: step.day, subject: step.subject, bodyHtml: body, scheduledAt: new Date(now + step.day * 86_400_000) },
    });
    if (step.day === 0) {
      sent = await deliverStep(prisma, { id: created.id, stepDay: 0, subject: step.subject, bodyHtml: body, lead }, content);
    }
  }
  return { leadId: lead.id, created: true, sent };
}

/** Cron: envía los pasos vencidos y reintenta los fallidos recientes. */
export async function processDueSteps(prisma: PrismaClient, limit = 50): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const steps = await prisma.nurtureStep.findMany({
    where: {
      OR: [
        { status: "PENDING", scheduledAt: { lte: now } },
        { status: "FAILED", scheduledAt: { lte: now, gte: new Date(now.getTime() - MAX_RETRY_AGE_MS) } },
      ],
    },
    include: { lead: { select: { id: true, email: true, nombre: true, slug: true, keyword: true, clientId: true } } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
  const result = { processed: 0, sent: 0, failed: 0 };
  for (const step of steps) {
    result.processed += 1;
    const content = await landingContent(prisma, step.lead.slug, step.lead.clientId);
    if (await deliverStep(prisma, step, content)) result.sent += 1;
    else result.failed += 1;
  }
  return result;
}

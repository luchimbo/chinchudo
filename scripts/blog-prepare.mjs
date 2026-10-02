// Preparación privada de la tanda inicial. Nunca despliega ni activa publicación.
// node scripts/blog-prepare.mjs --dry-run | --prepare | --generate
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { editorialIntentForDate } from "../src/lib/blog-quality.mjs";
import { terminateChild } from "./terminate-child.mjs";

const databaseUrl = new URL(process.env.DATABASE_URL);
if (!databaseUrl.searchParams.has("connection_limit")) databaseUrl.searchParams.set("connection_limit", "1");
if (!databaseUrl.searchParams.has("pool_timeout")) databaseUrl.searchParams.set("pool_timeout", "20");
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl.href } } });
const root = fileURLToPath(new URL("../", import.meta.url));
const dry = process.argv.includes("--dry-run");
const generate = process.argv.includes("--generate");
if (!dry && !generate && !process.argv.includes("--prepare")) throw new Error("Indicá --dry-run, --prepare o --generate.");
const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shift = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const localPython = resolve(root, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const python = process.env.AGENTS_PYTHON_BIN || (existsSync(localPython) ? localPython : "python");
const report = { command: "blog-prepare", timestamp: new Date().toISOString(), dryRun: dry, dates: [], errors: [] };
const starterTopics = [
  ["por qué MIDI no transmite audio y cómo se usa en un home studio", "educational", "controladores-midi"],
  ["controlador MIDI para tocar melodías o disparar samples: cómo decidir", "decision", "controladores-midi"],
  ["cómo organizar una sesión de grabación casera antes de conectar equipos", "educational", "interfaces-audio"],
  ["interfaz para grabación solista o entrevistas: cómo comparar necesidades", "decision", "interfaces-audio"],
  ["qué diferencia hay entre señal de micrófono y señal de línea", "educational", "interfaces-audio"],
  ["auriculares para grabación o edición: cómo evaluar tus necesidades", "decision", "auriculares"],
  ["cómo prevenir acoples al monitorear una voz durante una grabación", "educational", "microfonos-profesionales"],
  ["micrófono USB o cadena con interfaz para transmitir clases: qué verificar", "decision", "microfonos-streaming"],
  ["qué es la envolvente ADSR y cómo cambia un sonido de sintetizador", "educational", "sintetizadores"],
  ["sintetizador para diseñar sonidos o interpretar melodías: criterios de elección", "decision", "sintetizadores"],
  ["cómo distribuir la práctica musical en un departamento", "educational", "pianos-digitales"],
  ["instrumento para practicar en casa sin computadora: preguntas antes de elegir", "decision", "pianos-digitales"],
  ["cómo definir una cadena de audio para una entrevista remota", "educational", "microfonos-streaming"],
  ["primer equipo de audio para grabar narraciones: cómo priorizar la compra", "decision", "interfaces-audio"],
];
async function generateDay(day, clientId) {
  return new Promise((accept, reject) => {
    const child = spawn(python, [resolve(root, "landing-build/build_landings.py"), "--client-slug", "pcmidi", "generate", "--limit", "1", "--schedule-date", day, "--max-seconds", "180"], { cwd: root, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", LANDING_EXPECTED_CLIENT_ID: clientId } });
    let output = "";
    child.stdout.on("data", (data) => { output = (output + data.toString()).slice(-3000); });
    child.stderr.on("data", (data) => { output = (output + data.toString()).slice(-3000); });
    const timeout = setTimeout(() => terminateChild(child), 240_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code) => { clearTimeout(timeout); if (code === 0) accept(); else reject(new Error(output.slice(-1200))); });
  });
}
try {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "pcmidi" }, select: { id: true } });
  const key = `blog_daily_schedule:${client.id}`;
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  const config = JSON.parse(setting?.value || "{}");
  if (config.enabled) throw new Error("Apagá la publicación antes de preparar una tanda inicial.");
  const start = config.preparing && config.batchStart > localDay ? config.batchStart : shift(localDay, 1);
  console.log(JSON.stringify({ command: "blog-prepare", dryRun: dry, start, count: 14, enabled: false }));
  if (!dry) {
    const value = JSON.stringify({ ...config, enabled: false, preparing: true, batchStart: start, horizonDays: 14, reviewedBatchAt: null, reviewedFingerprint: null });
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    if (process.argv.includes("--starter-topics")) {
      for (const [keyword, intent, suggestedCategories] of starterTopics) {
        const exists = await prisma.seedTopic.findFirst({ where: { clientId: client.id, keyword } });
        if (!exists) await prisma.seedTopic.create({ data: { clientId: client.id, keyword, intent, suggestedCategories } });
      }
    }
  }
  for (let i = 0; i < 14; i++) {
    const day = shift(start, i), scheduledDate = new Date(`${day}T00:00:00Z`);
    const where = { clientId_scheduledDate: { clientId: client.id, scheduledDate } };
    let slot = dry ? await prisma.blogPublication.findUnique({ where }) : await prisma.blogPublication.upsert({ where, create: { clientId: client.id, scheduledDate }, update: {} });
    if (generate && !slot.landingId && slot.status !== "SKIPPED") {
      console.log(`Preparando ${day} · ${editorialIntentForDate(day)}`);
      try {
        await generateDay(day, client.id);
        slot = await prisma.blogPublication.findUnique({ where });
        if (!slot.landingId) throw new Error("No se generó un borrador; revisar disponibilidad de temas o proveedor de IA.");
      } catch (error) {
        const message = String(error).slice(-1200); report.errors.push({ day, message });
        await prisma.blogPublication.update({ where, data: { status: "FAILED", lastError: message } });
        slot = await prisma.blogPublication.findUnique({ where });
        console.error(`${day}: ${message}`);
      }
    }
    const entry = { day, intent: editorialIntentForDate(day), status: slot?.status || "PLANNED", landingId: slot?.landingId || null };
    report.dates.push(entry); console.log(JSON.stringify(entry));
  }
} finally {
  mkdirSync(resolve(root, "reports"), { recursive: true });
  const path = resolve(root, "reports", `blog-prepare-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  console.log(`Reporte: ${path}`);
}

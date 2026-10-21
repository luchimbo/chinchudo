// Shared calendar worker. Branding, language and deployment are tenant settings.
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createBlogDaily } from "./blog-daily.mjs";
import { withBlogLease } from "./blog-lease.mjs";
import { blogCodeStatus, restartOnBlogCodeChange } from "./blog-code-version.mjs";
import { terminateChild } from "./terminate-child.mjs";

const root = resolve(import.meta.dirname, ".."), port = 3102;
const db = new PrismaClient(), workers = new Map();
const token = process.env.AGENT_RELAY_TOKEN;
if (!token) throw new Error("Falta AGENT_RELAY_TOKEN.");
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const python = process.env.AGENTS_PYTHON_BIN || (existsSync(resolve(root, ".venv/Scripts/python.exe")) ? resolve(root, ".venv/Scripts/python.exe") : "python");

async function runPython(args, clientId, timeoutMs = 300_000, progress, stdin) {
  const client = await db.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } });
  return new Promise((accept, reject) => {
    const child = spawn(python, [resolve(root, "landing-build/build_landings.py"), "--client-slug", client.slug, ...args], { cwd: root, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", LANDING_EXPECTED_CLIENT_ID: clientId, BLOG_PREPARATION_ATTEMPT_ID: progress?.attemptId || "", BLOG_DAILY_SLOT: String(progress?.dailySlot || 0) } });
    child.stdin.end(stdin);
    let output = "", lines = "", updates = Promise.resolve();
    child.stdout.on("data", chunk => {
      const text = chunk.toString(); output = (output + text).slice(-8_000_000);
      lines += text; const completed = lines.split("\n"); lines = completed.pop();
      for (const line of completed) if (progress && line.startsWith("BLOG_PROGRESS:")) {
        try { const event = JSON.parse(line.slice(14)); if (event.attemptId === progress.attemptId) updates = updates.then(() => progress.onPhase(event.phase)); } catch { /* Ordinary logs have no state effect. */ }
      }
    });
    child.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-8_000_000); });
    const timer = setTimeout(() => terminateChild(child), timeoutMs);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", async code => {
      clearTimeout(timer);
      try { await updates; if (code === 0) accept(output); else reject(new Error(output.slice(-1500))); } catch (error) { reject(error); }
    });
  });
}

function worker(client) {
  if (!workers.has(client.id)) workers.set(client.id, createBlogDaily({ prisma: db, targetClientSlug: client.slug, runBlogPython: runPython, withLease: (id, fn) => withBlogLease(db, id, fn) }));
  return workers.get(client.id);
}
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const clients = await db.client.findMany({ where: { active: true }, select: { id: true, slug: true, responsePolicy: true } });
    for (const client of clients) {
      if (client.responsePolicy?.blog?.calendar !== true) continue;
      // PC MIDI ya corre en el relay principal; este servicio atiende los otros calendarios.
      if (secondaryCalendars && client.slug === "pcmidi") continue;
      await worker(client).runDailyBlogCalendar();
    }
  } catch (error) { console.error("[blog-runtime]", error.message); }
  finally { ticking = false; }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/blog/health")) return json(res, 200, { ok: true, blogRuntimeVersion: 1, previewOnly, secondaryCalendars, blogCode: blogCodeStatus() });
  if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: "unauthorized" });
  try {
    let text = "";
    for await (const chunk of req) { text += chunk; if (text.length > 150000) throw new Error("Pedido demasiado grande."); }
    const body = JSON.parse(text || "{}");
    if (req.method === "POST" && req.url === "/blog/publish") {
      if (![body.id, body.clientId, body.expectedUpdatedAt].every(value => typeof value === "string" && value.length > 0)) throw new Error("Faltan los datos de la publicación.");
      const client = await db.client.findUniqueOrThrow({ where: { id: body.clientId }, select: { id: true, slug: true } });
      await worker(client).publishBlogArticle(body, () => json(res, 202, { accepted: true }));
      return;
    }
    if (req.method === "POST" && req.url === "/landings/preview") {
      if (typeof body.clientSlug !== "string" || typeof body.landingId !== "string") throw new Error("Faltan los datos del artículo.");
      const client = await db.client.findUniqueOrThrow({ where: { slug: body.clientSlug }, select: { id: true, slug: true, name: true, storeUrl: true, blogBaseUrl: true, labName: true, logoUrl: true, landingTemplate: true, landingPrimaryColor: true, landingSecondaryColor: true, responsePolicy: true } });
      const [landing, categories, products] = await Promise.all([
        db.landing.findFirst({ where: { id: body.landingId, clientId: client.id } }),
        db.landingCategory.findMany({ where: { clientId: client.id } }),
        db.landingProduct.findMany({ where: { clientId: client.id } }),
      ]);
      if (!landing) throw new Error("Artículo no encontrado para este cliente.");
      const args = ["preview", "--landing-id", landing.id, "--base-url", body.blogBaseUrl || "", "--preview-context-stdin"];
      const catalog = {
        categories: categories.map(c => ({ id: c.key, nombre: c.name, url: c.url, descripcion: c.description, keywords: c.keywords, linkStatus: c.linkStatus })),
        products: products.map(p => ({ id: p.externalId, nombre: p.name, marca: p.brand, modelo: p.model, categoria_id: p.categoryKey, url: p.url, uso: p.useText, linkStatus: p.linkStatus, editorialEligible: p.sourceSnapshot?.editorialEligible ?? true })),
      };
      const output = await runPython(args, client.id, 20_000, undefined, JSON.stringify({ clientConfig: client, catalog, landing, content: body.content }));
      const start = output.search(/<!doctype html>/i), end = output.lastIndexOf("</html>");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(start >= 0 ? output.slice(start, end + 7) : output); return;
    }
    json(res, 404, { error: "not_found" });
  } catch (error) { if (!res.writableEnded) json(res, 409, { error: error.message }); else console.error("[blog-runtime]", error.message); }
});

let tunnel, stopping = false, restart, tunnelUrl = "", tunnelStartedAt = 0, healthFailures = 0;
function startTunnel() {
  if (stopping) return;
  tunnelUrl = ""; tunnelStartedAt = Date.now(); healthFailures = 0;
  tunnel = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`], { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let published = false;
  tunnel.stderr.on("data", async chunk => {
    const match = chunk.toString().match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
    if (!match || published) return; published = true;
    tunnelUrl = match[0];
    const key = "blog_runtime_relay_url";
    try { await db.appSetting.upsert({ where: { key }, create: { key, value: match[0] }, update: { value: match[0] } }); console.log("Shared blog runtime connected."); }
    catch (error) { console.error(error.message); }
  });
  tunnel.on("error", error => console.error(error.message));
  tunnel.on("close", () => { if (!stopping) restart = setTimeout(startTunnel, 5000); });
}
// Un quick tunnel puede perder su DNS sin terminar el proceso de cloudflared.
let checkingTunnel = false;
const watchdog = setInterval(async () => {
  if (stopping || checkingTunnel || !tunnel) return;
  if (!tunnelUrl) { if (Date.now() - tunnelStartedAt > 120_000) tunnel.kill(); return; }
  checkingTunnel = true;
  try {
    const response = await fetch(`${tunnelUrl}/health`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    healthFailures = 0;
  } catch {
    if (++healthFailures >= 3) { console.error("[blog-runtime] Túnel caído; recreando conexión."); tunnel?.kill(); }
  } finally { checkingTunnel = false; }
}, 60_000);
const previewOnly = process.argv.includes("--preview-only");
const secondaryCalendars = process.argv.includes("--secondary-calendars");
if (previewOnly && secondaryCalendars) throw new Error("Elegí un solo modo del servicio del blog.");
const timer = previewOnly ? undefined : setInterval(tick, 15000);
server.listen(port, "127.0.0.1", () => { console.log(`Shared blog runtime on ${port}.`); startTunnel(); if (!previewOnly) void tick(); });
restartOnBlogCodeChange({ label: "blog-runtime", isBusy: () => [...workers.values()].some(worker => { const state = worker.runtimeState(); return state.running || state.generating; }), restart: () => process.kill(process.pid, "SIGTERM") });
for (const event of ["SIGINT", "SIGTERM"]) process.on(event, () => { stopping = true; clearInterval(timer); clearInterval(watchdog); clearTimeout(restart); tunnel?.kill(); server.close(); void db.$disconnect().finally(() => process.exit(0)); });

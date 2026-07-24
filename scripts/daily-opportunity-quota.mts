import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
// @ts-ignore -- shared operational environment loader.
import { loadEnv } from "./agent-utils.mjs";
// @ts-ignore -- shared ESM helper used by operational scripts.
import { runtimeDir } from "./agent-utils.mjs";

loadEnv();
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const REQUIRED_CHANNELS = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "x", "youtube"] as const;
const LISTEN_TIMEOUT_MS = Number(process.env.DAILY_QUOTA_LISTEN_TIMEOUT_MS || 60_000);
const IMPORT_TIMEOUT_MS = Number(process.env.DAILY_QUOTA_IMPORT_TIMEOUT_MS || 90_000);
const CLASSIFIER_TIMEOUT_MS = Number(process.env.OPPORTUNITY_CLASSIFIER_TIMEOUT_MS || 120_000);
// Zero means "keep looking until the daily quota is real". A finite value is
// only for diagnostics and controlled runs via --max-rounds=N.
const DEFAULT_MAX_ROUNDS = Number(process.env.DAILY_QUOTA_MAX_ROUNDS || 0);
const MAX_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.DAILY_QUOTA_CONCURRENCY || 6)));

type Source = { id: string; label: string; channel: string; query: string; account: string | null; limit: number; lastRunAt: Date | null; lifecycle: string; priority: number; emptyReads: number };
type Client = { id: string; slug: string; name: string; dailyOpportunityTarget: number; opportunitySearchState: unknown; domainKeywords: string };
type CommandResult = { code: number | null; stdout: string; stderr: string; output: string; timedOut: boolean };
type ListenSummary = { rows?: any[]; summary?: { discarded_count?: number; discard_reasons?: Record<string, number>; error?: string; items_read?: number; intake_rows?: number; discovery_mode?: string; direct_items?: number; indexed_items?: number } };

function argentinaDayStart(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
}

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = 20_000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${timeoutMs}ms`)), timeoutMs);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function stopProcessTree(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }).unref();
    return;
  }
  try { process.kill(-pid, "SIGKILL"); } catch { /* already exited */ }
}

function run(command: string, args: string[], timeoutMs?: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const usesTsx = command === "npx" && args[0] === "tsx";
    const executable = usesTsx ? process.execPath : command;
    const commandArgs = usesTsx ? [join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), ...args.slice(1)] : args;
    const child = spawn(executable, commandArgs, { cwd: process.cwd(), env: process.env, shell: false, windowsHide: true, detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number | null, suffix = "", timedOut = false) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const output = `${stdout}${stderr}${suffix}`;
      resolve({ code, stdout, stderr, output, timedOut });
    };
    const timer = timeoutMs
      ? setTimeout(() => { stopProcessTree(child.pid); finish(-1, `\nTimeout tras ${timeoutMs}ms`, true); }, timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("close", (code) => finish(code));
    child.on("error", (error) => finish(-1, error.message));
  });
}

function cliOption(name: string) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] || "";
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  return inline || process.env[`npm_config_${name.slice(2).replace(/-/g, "_")}`] || "";
}

function parseKeywords(client: Client) {
  try { return JSON.parse(client.domainKeywords || "[]").filter((value: unknown) => typeof value === "string") as string[]; }
  catch { return []; }
}

// Queries are intentionally phrased as everyday needs, not as a stack of
// product/brand/launch terms.  People looking for help normally say "teclado
// para empezar", "me despidieron" or "me salen ampollas al correr"; the
// relevance classifier decides whether that conversation is actionable.
//
// Sources still select the channel/account and rotate normally, but do not
// narrow the daily radar to the source's original (often brand-specific)
// query.  This lets each active client discover demand before a brand is
// mentioned.
const COMMON_QUERIES_BY_CLIENT: Record<string, string[]> = {
  pcmidi: [
    "midi", "teclado", "piano", "controlador", "sintetizador", "sampler",
    "secuenciador", "pad", "drum pad", "bateria electronica", "bateria electrica", "electronic drums", "e drums",
    "bateria electronica para empezar", "bateria electronica principiantes", "bateria electronica para niños",
    "bateria electronica departamento", "bateria electronica vecinos", "bateria electronica silenciosa",
    "bateria electronica auriculares", "bateria electronica ruido", "bateria electronica espacio reducido",
    "bateria electronica parches de malla", "bateria electronica pads de goma", "bateria electronica rebote",
    "bateria electronica pedal bombo", "bateria electronica doble pedal", "bateria electronica hi hat",
    "bateria electronica redoblante", "bateria electronica platos", "bateria electronica midi",
    "bateria electronica usb", "bateria electronica grabar", "bateria electronica daw", "bateria electronica latencia",
    "bateria electronica precio", "bateria electronica cuotas", "bateria electronica stock", "bateria electronica garantia",
    "bateria electronica repuestos", "bateria electronica service", "que bateria electronica comprar",
    "mejor bateria electronica", "bateria electronica comparativa", "bateria electronica opiniones",
    "bateria electronica argentina", "bateria electronica usada", "Alesis bateria electronica",
    "Roland bateria electronica", "Yamaha bateria electronica", "Donner bateria electronica",
    "Medeli bateria electronica", "Simmons bateria electronica", "Millenium bateria electronica",
    "Millenium electronic drums", "Millenium MPS", "Millenium MPS opiniones",
    "Millenium MPS problemas", "Millenium MPS comparativa", "interfaz",
    "placa audio", "microfono", "auriculares", "monitores", "parlantes",
    "home studio", "grabacion", "produccion", "beats", "dj", "fl studio",
    "ableton", "garageband", "latencia", "driver", "usb", "reaper",
    "logic pro", "cubase", "precio", "cuotas", "garantia", "argentina",
    "teclas", "octavas", "piano usb", "piano electrico", "teclado usb",
    "teclado barato", "controlador usb", "controlador daw", "midi bluetooth",
    "midi celular", "midi iphone", "midi android", "vst", "plugins", "asio",
    "phantom power", "cable xlr", "cable midi", "adaptador audio", "mixer",
    "consola audio", "preamp", "vocales", "podcast", "streaming", "sonido",
    "acustica", "espuma acustica", "tratamiento acustico", "metronomo",
    "maquina ritmos", "sintetizador analogico", "sintetizador digital", "looper",
    "arturia", "akai", "novation", "korg", "focusrite", "behringer",
  ],
  jurispedia: [
    // Problem-first phrases resemble how a person asks for help in public.
    // Keep them short enough for social search while preserving legal intent.
    "me despidieron", "no me pagan", "trabajo en negro", "horas extras",
    "problema alquiler", "aumento alquiler", "carta documento", "consulta abogado",
    "me estafaron", "reclamo consumidor", "cuota alimentaria", "obra social",
    "me chocaron", "accidente transito", "embargo sueldo", "deuda tarjeta",
    "divorcio tenencia", "sucesion herencia", "marca registrada", "contrato laboral",
    "abogado", "consulta legal", "despido", "indemnizacion", "renuncia",
    "sueldo", "horas extras", "trabajo negro", "alquiler", "contrato",
    "deposito", "expensas", "consumidor", "estafa", "reclamo", "garantia",
    "mercadolibre", "accidente", "choque", "seguro", "multa", "alimentos",
    "tenencia", "divorcio", "sucesion", "herencia", "laboral", "familia",
    "transito", "derechos", "argentina",
    "jubilacion", "pension", "anses", "monotributo", "afip", "impuestos",
    "embargo", "deuda", "veraz", "banco", "tarjeta", "credito", "prestamo",
    "usurpacion", "desalojo", "propiedad", "escritura", "inmueble", "consorcio",
    "daños", "perjuicios", "denuncia", "fiscalia", "penal", "civil", "amparo",
    "obra social", "discapacidad", "migraciones", "ciudadania", "sociedad",
    "quiebra", "pymes", "comercio", "patente", "marca registrada", "copropiedad",
  ],
  "prestige-running": [
    "running", "correr", "runner", "maraton", "media maraton", "5k", "10k",
    "21k", "trail", "entrenamiento", "ritmo", "resistencia", "recuperacion",
    "zapatillas", "medias", "soquetes", "compresion", "ampollas", "rozaduras",
    "sudor", "pies", "gemelos", "pantorrilla", "calzas", "remera", "campera",
    "indumentaria", "reloj", "cinturon", "botella", "hidratacion", "montaña",
    "principiantes", "carrera", "club running", "argentina",
    "trote", "trotar", "aerobico", "cardio", "fondista", "atletismo", "pista",
    "asfalto", "sendero", "ultra trail", "cross country", "kilometraje", "series",
    "fartlek", "pasadas", "calentamiento", "elongacion", "movilidad", "rodilla",
    "tobillo", "talon", "fascitis", "plantillas", "polainas", "visera", "gorra",
    "rompeviento", "camiseta", "short running", "calentadores", "reflectivo",
    "linterna running", "mochila hidratacion", "gel energetico", "electrolitos",
    "dorsal", "cronometro", "pace", "strava", "runkeeper", "running team",
  ],
};

// A HasData-like query matrix, executed through the existing authorised CDP
// sessions. Query rotation happens before a source is repeated.
function queryPlan(source: Source, client: Client) {
  const base = source.query.trim();
  const common = COMMON_QUERIES_BY_CLIENT[client.slug];
  if (common?.length) return common;
  const keyword = parseKeywords(client).find((value) => value.length > 3 && value.length < 45) || client.name;
  return [...new Set([base, keyword].map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function canonicalUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|igshid$|si$|feature$|t$)/i.test(key)) url.searchParams.delete(key);
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}?${url.searchParams}`;
  } catch { return raw.trim().toLowerCase(); }
}

function parseListenOutput(output: string): ListenSummary | null {
  try { return JSON.parse(output) as ListenSummary; }
  catch { return null; }
}

async function newCount(clientId: string, since: Date) {
  return withTimeout(prisma.opportunity.count({ where: { clientId, createdAt: { gte: since }, status: { not: "DISCARDED" } } }), "Conteo de oportunidades");
}

async function mapConcurrent<T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency = MAX_CONCURRENCY) {
  const result: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}

async function writeFailureReport(error: unknown) {
  const reportPath = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-daily-opportunity-quota.json`);
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ command: "daily-opportunity-quota", status: "failed", error: error instanceof Error ? error.stack || error.message : String(error) }, null, 2));
  return reportPath;
}

async function writeProgressReport(runId: string, client: Client, target: number, count: number, maxRounds: number, attempts: Record<string, unknown>[]) {
  const reportPath = join(process.cwd(), "reports", `${runId}-${client.slug}-daily-opportunity-quota-progress.json`);
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  await writeFile(reportPath, JSON.stringify({
    command: "daily-opportunity-quota",
    status: count >= target ? "quota_reached" : "searching",
    client: client.slug,
    target,
    newOpportunities: count,
    maxRounds: maxRounds || "until-quota",
    roundsCompleted: Math.max(0, ...attempts.filter((attempt) => typeof attempt.round === "number").map((attempt) => Number(attempt.round))),
    attempts,
  }, null, 2));
}

async function runClient(client: Client, since: Date, maxRounds: number, runId: string, concurrency: number) {
  const target = Math.max(1, Number(cliOption("--target")) || client.dailyOpportunityTarget || 15);
  const sources = await withTimeout(prisma.monitoredSource.findMany({ where: { clientId: client.id, active: true, lifecycle: { in: ["active", "proposed"] } }, orderBy: [{ priority: "desc" }, { lastRunAt: "asc" }, { label: "asc" }] }), `Lectura de fuentes de ${client.slug}`) as Source[];
  const configuredChannels = [...new Set(sources.map((source) => source.channel))].sort();
  const attempts: Record<string, unknown>[] = [];
  const seenUrls = new Set<string>();
  const stagedRows: any[] = [];
  const discards: Record<string, number> = {};
  const sourcesByChannel = new Map<string, Source[]>();
  for (const source of sources) sourcesByChannel.set(source.channel, [...(sourcesByChannel.get(source.channel) || []), source]);
  let cursor = Number((client.opportunitySearchState as { cursor?: number })?.cursor ?? 0);
  let count = await newCount(client.id, since);

  // Always execute the first round for coverage, even when prior runs already
  // reached the numeric quota. Later rounds are only needed to fill the quota.
  for (let round = 0; (maxRounds === 0 || round < maxRounds) && (round === 0 || count < target); round += 1) {
    // One rotating source per network is enough for full coverage in a round.
    // This keeps a client with many saved searches from spawning an unbounded
    // number of CDP sessions while still rotating every account/query later.
    const jobs = [...sourcesByChannel.entries()].map(([channel, channelSources], index) => {
      const source = channelSources[(cursor + round) % channelSources.length];
      const queries = queryPlan(source, client);
      return { source, query: queries[(cursor + round + index) % queries.length], round };
    });
    const outcomes = await mapConcurrent(jobs, async ({ source, query, round: jobRound }) => {
      const electronicDrumSearch = /\b(bater[ií]a(?:s)?\s+electr[oó]nica(?:s)?|electronic\s+drums?|e[- ]?drums?)\b/i.test(query);
      const effectiveLimit = electronicDrumSearch ? Math.max(source.limit, 100) : Math.max(source.limit, 12);
      const args = ["agents/social-listen.py", "--channel", source.channel, "--query", query, "--limit", String(effectiveLimit)];
      if (source.account?.trim()) args.push("--account", source.account);
      args.push("--source-id", source.id, "--client-id", client.id, "--language", "es", "--dry-run", "--output-json");
      const listened = await run("python", args, electronicDrumSearch ? undefined : LISTEN_TIMEOUT_MS);
      // social-listen emits its machine-readable payload on stdout and structured
      // diagnostics on stderr. Parsing their combined output turns a valid
      // result into a silent zero-candidate attempt.
      return { source, query, round: jobRound, listened, payload: listened.code === 0 ? parseListenOutput(listened.stdout) : null, args, electronicDrumSearch };
    }, concurrency);

    // Public indexers aggressively throttle bursts. Direct connectors can run
    // concurrently, but retry empty channels through the indexed monitor one
    // at a time, using the source's focused query instead of a broad rotation.
    for (const outcome of outcomes) {
      if (Number(outcome.payload?.summary?.items_read || 0) > 0) continue;
      const indexedArgs = [...outcome.args];
      const accountAt = indexedArgs.indexOf("--account");
      if (accountAt >= 0) indexedArgs.splice(accountAt, 2);
      const queryAt = indexedArgs.indexOf("--query");
      if (queryAt >= 0) indexedArgs[queryAt + 1] = outcome.source.query;
      indexedArgs.push("--indexed-only");
      const indexed = await run("python", indexedArgs, outcome.electronicDrumSearch ? undefined : LISTEN_TIMEOUT_MS);
      const indexedPayload = indexed.code === 0 ? parseListenOutput(indexed.stdout) : null;
      if (indexedPayload) {
        outcome.listened = indexed;
        outcome.payload = indexedPayload;
      }
    }

    for (const outcome of outcomes) {
      const summary = outcome.payload?.summary;
      const rows = outcome.payload?.rows || [];
      let accepted = 0;
      for (const row of rows) {
        const url = canonicalUrl(String(row.sourceUrl || ""));
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);
        stagedRows.push(row);
        accepted += 1;
      }
      for (const [reason, value] of Object.entries(summary?.discard_reasons || {})) discards[reason] = (discards[reason] || 0) + value;
      const listenError = summary?.error || (outcome.listened.code === 0 ? "" : outcome.listened.output.slice(-500));
      const itemsRead = Number(summary?.items_read || 0);
      const discardedCount = Number(summary?.discarded_count || 0);
      await withTimeout(prisma.monitoredSource.update({
        where: { id: outcome.source.id },
        data: {
          lastRunAt: new Date(),
          lastItemsRead: itemsRead,
          lastCandidates: accepted,
          lastDiscarded: discardedCount,
          lastCount: accepted,
          lastError: String(listenError || "").slice(0, 2000),
          lastDiscoveryMode: String(summary?.discovery_mode || (itemsRead > 0 ? "direct" : "indexed")),
          emptyReads: itemsRead > 0 ? 0 : { increment: 1 },
          lastEvidenceAt: accepted > 0 ? new Date() : undefined,
          lifecycle: itemsRead > 0 ? "active" : "proposed",
          blockedReason: listenError
            ? "Error en la última corrida"
            : itemsRead === 0
              ? "La fuente respondió sin elementos; se ejecutó fallback indexado"
              : accepted === 0
                ? "Lectura correcta, sin candidatos relevantes"
                : "",
        },
      }), `Telemetría de ${outcome.source.label}`);
      attempts.push({ source: outcome.source.label, channel: outcome.source.channel, query: outcome.query, round: outcome.round + 1, listenCode: outcome.listened.code, listenTimedOut: outcome.listened.timedOut, itemsRead, potableCandidates: accepted, discarded: discardedCount, discoveryMode: summary?.discovery_mode || "", directItems: summary?.direct_items || 0, indexedItems: summary?.indexed_items || 0, error: listenError });
    }

    // Import only the isolated rows collected in this wave. Import remains
    // serial because Prisma dedupe and client routing are the source of truth.
    if (stagedRows.length) {
      const intakeRelative = join("runtime", "intake", `daily-quota-${runId}-${client.slug}-${round}.jsonl`);
      const intakePath = join(process.cwd(), intakeRelative);
      await mkdir(join(runtimeDir, "intake"), { recursive: true });
      await appendFile(intakePath, `${stagedRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
      // Classification can take up to ~12 seconds per candidate. Scale the
      // import allowance with the isolated batch so a healthy intake is not
      // killed midway through and reported as a false technical failure.
      const importTimeoutMs = Math.max(IMPORT_TIMEOUT_MS, 30_000 + stagedRows.length * (CLASSIFIER_TIMEOUT_MS + 5_000));
      const imported = await run("npx", ["tsx", "scripts/import-opportunities.mts", "--input", intakeRelative], importTimeoutMs);
      attempts.push({ source: "import", channel: "internal", query: "", round: round + 1, importCode: imported.code, importTimedOut: imported.timedOut, stagedRows: stagedRows.length, error: imported.code === 0 ? "" : imported.output.slice(-500) });
      stagedRows.length = 0;
      count = await newCount(client.id, since);
    }
    cursor += 1;
    // Checkpoint every round: if the process is interrupted, the next run
    // resumes from a different source/query instead of starting over.
    await withTimeout(prisma.client.update({ where: { id: client.id }, data: { opportunitySearchState: { cursor, lastRunAt: new Date().toISOString(), lastTarget: target, lastCount: count, maxRounds, attempts } } }), `Checkpoint de ${client.slug}`);
    await writeProgressReport(runId, client, target, count, maxRounds, attempts);
  }

  const attemptedChannels = [...new Set(attempts.filter((attempt) => attempt.channel !== "internal").map((attempt) => String(attempt.channel)))].sort();
  const missingConfiguredChannels = REQUIRED_CHANNELS.filter((channel) => !configuredChannels.includes(channel));
  const unattemptedConfiguredChannels = configuredChannels.filter((channel) => !attemptedChannels.includes(channel));
  const blockedChannels = [...new Set(attempts.filter((attempt) => Boolean(attempt.listenTimedOut) || Boolean(attempt.error)).map((attempt) => String(attempt.channel)).filter((channel) => channel !== "internal"))].sort();
  const exhaustedChannels = maxRounds > 0
    ? configuredChannels.filter((channel) => attempts.filter((attempt) => attempt.channel === channel).length >= maxRounds)
    : [];
  const coverageComplete = missingConfiguredChannels.length === 0 && unattemptedConfiguredChannels.length === 0;
  await withTimeout(prisma.client.update({ where: { id: client.id }, data: { opportunitySearchState: { cursor, lastRunAt: new Date().toISOString(), lastTarget: target, lastCount: count, maxRounds, attempts } } }), `Actualizacion de estado de ${client.slug}`);
  return { client: client.slug, target, newOpportunities: count, quotaComplete: count >= target, coverageComplete, complete: count >= target && coverageComplete, configuredChannels, attemptedChannels, missingConfiguredChannels, unattemptedConfiguredChannels, exhaustedChannels, blockedChannels, deduplicatedUrls: seenUrls.size, discardReasons: discards, attempts };
}

async function main() {
  const since = argentinaDayStart();
  const maxRoundsOption = cliOption("--max-rounds");
  const maxRounds = maxRoundsOption === "" ? DEFAULT_MAX_ROUNDS : Math.max(0, Number(maxRoundsOption));
  const clientSlug = cliOption("--client");
  const clients = await withTimeout(prisma.client.findMany({ where: { active: true, ...(clientSlug ? { slug: clientSlug } : {}) }, select: { id: true, slug: true, name: true, dailyOpportunityTarget: true, opportunitySearchState: true, domainKeywords: true } }), "Lectura de clientes activos") as Client[];
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  // Divide the global browser cap across active clients. Each account keeps
  // progressing even if another account has a temporarily empty network.
  const perClientConcurrency = Math.min(2, Math.max(1, Math.floor(MAX_CONCURRENCY / Math.max(clients.length, 1))));
  const report = await Promise.all(clients.map((client) => runClient(client, since, maxRounds, runId, perClientConcurrency)));
  const payload = { command: "daily-opportunity-quota", since: since.toISOString(), maxRounds, concurrency: MAX_CONCURRENCY, clients: report };
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const reportPath = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-daily-opportunity-quota.json`);
  await writeFile(reportPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ...payload, reportPath }, null, 2));
  await withTimeout(prisma.$disconnect(), "Cierre de Prisma", 5_000);
}

main().catch(async (error) => {
  try { console.error(`daily-opportunity-quota failed. Reporte: ${await writeFailureReport(error)}`); } catch { /* best effort */ }
  console.error(error);
  try { await withTimeout(prisma.$disconnect(), "Cierre de Prisma", 5_000); } catch { /* exit */ }
  process.exit(1);
});

import { spawn } from "node:child_process";
import { join } from "node:path";
import { prisma } from "@/lib/db";

export const SEARCH_CHANNELS = ["youtube"] as const;
export const SEARCH_LANGUAGES = ["es", "en", "pt", "any"] as const;
export const SEARCH_CHANNEL_TIMEOUT_MS = 20_000;

const ELECTRONIC_DRUM_QUERY_PATTERN = /\b(bater[ií]a(?:s)?\s+electr[oó]nica(?:s)?|electronic\s+drums?|e[- ]?drums?)\b/i;
const ELECTRONIC_DRUM_DEEP_QUERIES = [
  "bateria electronica", "bateria electrica", "electronic drums", "e drums",
  "bateria electronica para empezar", "bateria electronica principiantes", "bateria electronica para niños",
  "bateria electronica departamento", "bateria electronica vecinos", "bateria electronica silenciosa",
  "bateria electronica auriculares", "bateria electronica ruido", "bateria electronica espacio reducido",
  "bateria electronica parches de malla", "bateria electronica pads de goma", "bateria electronica rebote",
  "bateria electronica feeling", "bateria electronica pedal bombo", "bateria electronica doble pedal",
  "bateria electronica hi hat", "bateria electronica redoblante", "bateria electronica platos",
  "bateria electronica midi", "bateria electronica usb", "bateria electronica grabar", "bateria electronica daw",
  "bateria electronica latencia", "bateria electronica bluetooth", "bateria electronica parlante",
  "bateria electronica precio", "bateria electronica cuotas", "bateria electronica stock",
  "bateria electronica garantia", "bateria electronica repuestos", "bateria electronica service",
  "que bateria electronica comprar", "mejor bateria electronica", "bateria electronica comparativa",
  "bateria electronica opiniones", "bateria electronica argentina", "bateria electronica usada",
  "Alesis bateria electronica", "Roland bateria electronica", "Yamaha bateria electronica",
  "Donner bateria electronica", "Medeli bateria electronica", "Simmons bateria electronica",
  "Millenium bateria electronica", "Millenium electronic drums", "Millenium MPS",
  "Millenium MPS opiniones", "Millenium MPS problemas", "Millenium MPS comparativa",
] as const;

function expandElectronicDrumQueries(queries: string[]) {
  if (!queries.some((query) => ELECTRONIC_DRUM_QUERY_PATTERN.test(query))) return queries;
  return [...new Set([...queries, ...ELECTRONIC_DRUM_DEEP_QUERIES])];
}

export type SearchEvent = {
  status:
    | "queued"
    | "started"
    | "channel_started"
    | "listen_done"
    | "import_started"
    | "import_done"
    | "channel_empty"
    | "channel_timeout"
    | "error"
    | "done";
  channel?: string;
  message?: string;
  data?: Record<string, unknown>;
  createdAt: string;
};

export type SearchTotals = {
  itemsRead: number;
  intakeRows: number;
  createdOrProcessed: number;
  duplicates: number;
  discarded: number;
  completedChannels: number;
  timedOutChannels: number;
  errors: number;
  attemptedSearches: number;
  totalSearches: number;
};

export type SearchJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  createdAt: string;
  updatedAt: string;
  params: {
    clientId: string;
    channels: string[];
    query: string;
    queries?: string[];
    language: string;
    limit: number;
  };
  events: SearchEvent[];
  totals: SearchTotals;
};

type CommandConfig = {
  command: string;
  argsPrefix: string[];
};

const globalJobs = globalThis as typeof globalThis & {
  __opportunitySearchJobs?: Map<string, SearchJob>;
};

const jobs = globalJobs.__opportunitySearchJobs ?? new Map<string, SearchJob>();
globalJobs.__opportunitySearchJobs = jobs;

function emptyTotals(): SearchTotals {
  return {
    itemsRead: 0,
    intakeRows: 0,
    createdOrProcessed: 0,
    duplicates: 0,
    discarded: 0,
    completedChannels: 0,
    timedOutChannels: 0,
    errors: 0,
    attemptedSearches: 0,
    totalSearches: 0,
  };
}

function now() {
  return new Date().toISOString();
}

function commandName(name: "python" | "npx"): CommandConfig {
  if (name === "python") {
    // Preferir la ruta específica para agents (AGENTS_PYTHON_BIN), luego el bin genérico (PYTHON_BIN)
    const pythonBin = process.env.AGENTS_PYTHON_BIN || process.env.PYTHON_BIN;
    if (pythonBin) return { command: pythonBin, argsPrefix: [] };
  }
  if (process.platform !== "win32") return { command: name, argsPrefix: [] };
  const executable = name === "npx" ? "npx.cmd" : "python.exe";
  return { command: "cmd.exe", argsPrefix: ["/d", "/s", "/c", executable] };
}

function extractLastJson(stdout: string) {
  const first = stdout.indexOf("{");
  const last = stdout.lastIndexOf("}");
  if (first < 0 || last < first) return null;
  try {
    return JSON.parse(stdout.slice(first, last + 1));
  } catch {
    return null;
  }
}

function parseImportSummary(stdout: string) {
  const processed = stdout.match(/import-opportunities:\s+(\d+)\s+procesadas/i);
  const discarded = stdout.match(/\((\d+)\s+de ellas auto-descartadas\)/i);
  const duplicates = stdout.match(/,\s+(\d+)\s+duplicadas/i);
  return {
    createdOrProcessed: processed ? Number(processed[1]) : 0,
    discardedAtImport: discarded ? Number(discarded[1]) : 0,
    duplicates: duplicates ? Number(duplicates[1]) : 0,
    raw: stdout.trim().slice(-1000),
  };
}

function runProcess(
  commandConfig: CommandConfig,
  args: string[],
  onLine: (line: string, stream: "stdout" | "stderr") => void,
  timeoutMs?: number
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child: ReturnType<typeof spawn> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    try {
      const spawned = spawn(commandConfig.command, [...commandConfig.argsPrefix, ...args], {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
      });
      child = spawned;

      if (timeoutMs) {
        timer = setTimeout(() => {
          timedOut = true;
          stderr = `${stderr}\nTimeout tras ${timeoutMs}ms`;
          child?.kill("SIGTERM");
          setTimeout(() => {
            if (!settled) child?.kill("SIGTERM");
          }, 2_000);
        }, timeoutMs);
      }

      const collect = (chunk: Buffer, stream: "stdout" | "stderr") => {
        const text = chunk.toString();
        if (stream === "stdout") stdout += text;
        else stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line, stream);
      };

      spawned.stdout.on("data", (chunk) => collect(chunk, "stdout"));
      spawned.stderr.on("data", (chunk) => collect(chunk, "stderr"));
      spawned.on("close", (code) => finish(code));
      spawned.on("error", (error) => {
        stderr = `${stderr}\n${error.message}`;
        finish(-1);
      });
    } catch (error) {
      stderr = `${stderr}\n${error instanceof Error ? error.message : String(error)}`;
      finish(-1);
    }
  });
}

async function buildQuery(clientId: string, query: string) {
  const trimmed = query.trim();
  if (trimmed) return { query: trimmed, suggestions: [] as string[] };

  const [client, products] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { domainKeywords: true, name: true } }),
    prisma.product.findMany({
      where: { brand: { clientId } },
      select: { name: true, category: true, brand: { select: { name: true } } },
      take: 8,
    }),
  ]);
  const domainKeywords = (() => {
    try {
      const parsed = JSON.parse(client?.domainKeywords || "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();
  const suggestions = [
    ...domainKeywords.slice(0, 6),
    ...products.slice(0, 4).map((p) => `${p.brand.name} ${p.name}`),
  ].filter(Boolean);
  return {
    query: suggestions.slice(0, 4).join(" ") || client?.name || "MidiPlus controlador MIDI",
    suggestions,
  };
}

function addEvent(job: SearchJob, event: Omit<SearchEvent, "createdAt">) {
  job.updatedAt = now();
  job.events.push({ ...event, createdAt: job.updatedAt });
}

async function runJob(job: SearchJob) {
  job.status = "running";
  job.updatedAt = now();
  const { query, suggestions } = await buildQuery(job.params.clientId, job.params.query);
  const requestedQueries = (job.params.queries && job.params.queries.length > 0 ? job.params.queries : [query])
    .map((item) => item.trim())
    .filter(Boolean);
  const queries = expandElectronicDrumQueries(requestedQueries);
  const electronicDrumDeepSearch = requestedQueries.some((item) => ELECTRONIC_DRUM_QUERY_PATTERN.test(item));
  const effectiveLimit = electronicDrumDeepSearch ? Math.max(job.params.limit, 100) : job.params.limit;
  job.totals.totalSearches = job.params.channels.length * queries.length;
  addEvent(job, {
    status: "started",
    message: "Busqueda iniciada en segundo plano.",
    data: { ...job.params, query, queries, suggestions, electronicDrumDeepSearch, effectiveLimit },
  });

  try {
    for (const channel of job.params.channels) {
      for (const singleQuery of queries) {
        job.totals.attemptedSearches += 1;
        addEvent(job, {
          status: "channel_started",
          channel,
          message: `Buscando "${singleQuery}" en ${channel} (${job.totals.attemptedSearches}/${job.totals.totalSearches})...`,
          data: { query: singleQuery, attemptedSearches: job.totals.attemptedSearches, totalSearches: job.totals.totalSearches },
        });
        const listen = await runProcess(commandName("python"), [
          join("agents", "social-listen.py"),
          "--channel", channel,
          "--query", singleQuery,
          "--limit", String(effectiveLimit),
          "--client-id", job.params.clientId,
          "--language", job.params.language,
        ], (line, streamName) => {
          if (streamName === "stderr" && line.includes("ERROR")) {
            addEvent(job, { status: "error", channel, message: line.slice(0, 500), data: { query: singleQuery } });
          }
        }, electronicDrumDeepSearch ? undefined : SEARCH_CHANNEL_TIMEOUT_MS);

        if (listen.timedOut) {
          job.totals.timedOutChannels += 1;
          addEvent(job, {
            status: "channel_timeout",
            channel,
            message: `${channel} tardo mas de 20 segundos buscando "${singleQuery}". Pasando a la siguiente busqueda.`,
            data: { timeoutMs: SEARCH_CHANNEL_TIMEOUT_MS, query: singleQuery },
          });
          continue;
        }

        const listenSummary = extractLastJson(listen.stdout) as any;
        if (listen.code !== 0 || !listenSummary) {
          job.totals.errors += 1;
          addEvent(job, {
            status: "error",
            channel,
            message: listen.stderr.trim() || "No se pudo leer el resumen de escucha.",
            data: { code: listen.code, query: singleQuery },
          });
          continue;
        }

        job.totals.itemsRead += Number(listenSummary.items_read || 0);
        job.totals.intakeRows += Number(listenSummary.intake_rows || 0);
        job.totals.discarded += Number(listenSummary.discarded_count || 0);
        if (Number(listenSummary.intake_rows || 0) === 0) {
          addEvent(job, {
            status: "channel_empty",
            channel,
            message: `${listenSummary.items_read || 0} leidos para "${singleQuery}", pero ninguno califico como oportunidad.`,
            data: listenSummary,
          });
          continue;
        }
        addEvent(job, {
          status: "listen_done",
          channel,
          message: `${listenSummary.items_read || 0} items leidos para "${singleQuery}", ${listenSummary.intake_rows || 0} candidatos.`,
          data: listenSummary,
        });

        addEvent(job, { status: "import_started", channel, message: `Importando oportunidades de "${singleQuery}"...`, data: { query: singleQuery } });
        const imported = await runProcess(commandName("npx"), ["tsx", "scripts/import-opportunities.mts"], () => {});
        const importSummary = parseImportSummary(imported.stdout);
        if (imported.code !== 0) {
          job.totals.errors += 1;
          addEvent(job, {
            status: "error",
            channel,
            message: imported.stderr.trim() || importSummary.raw || "Fallo la importacion.",
            data: { code: imported.code, query: singleQuery },
          });
          continue;
        }

        job.totals.createdOrProcessed += importSummary.createdOrProcessed;
        job.totals.duplicates += importSummary.duplicates;
        job.totals.completedChannels += 1;
        addEvent(job, {
          status: "import_done",
          channel,
          message: `${importSummary.createdOrProcessed} procesadas, ${importSummary.duplicates} duplicadas.`,
          data: { ...importSummary, query: singleQuery },
        });
      }
    }

    job.status = "done";
    addEvent(job, {
      status: "done",
      message: job.totals.createdOrProcessed > 0 ? "Busqueda finalizada." : "No se encontraron oportunidades nuevas.",
      data: job.totals,
    });
  } catch (error) {
    job.status = "error";
    job.totals.errors += 1;
    addEvent(job, {
      status: "error",
      message: error instanceof Error ? error.message : "Error inesperado durante la busqueda.",
    });
    addEvent(job, { status: "done", message: "Busqueda interrumpida por un error interno.", data: job.totals });
  }
}

export function createOpportunitySearchJob(params: SearchJob["params"]) {
  const id = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = now();
  const job: SearchJob = {
    id,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    params,
    events: [{ status: "queued", message: "Busqueda en cola.", createdAt: timestamp }],
    totals: emptyTotals(),
  };
  jobs.set(id, job);
  void runJob(job);
  return job;
}

export function getOpportunitySearchJob(id: string) {
  return jobs.get(id) ?? null;
}

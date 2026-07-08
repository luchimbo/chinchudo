import { spawn } from "node:child_process";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { relayFetch } from "@/lib/relay-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHANNELS = ["youtube", "reddit", "facebook", "instagram", "x", "tiktok", "linkedin"] as const;
const LANGUAGES = ["es", "en", "pt", "any"] as const;
const SEARCH_CHANNEL_TIMEOUT_MS = 90_000;

const searchSchema = z.object({
  clientId: z.string().min(1),
  channels: z.array(z.enum(CHANNELS)).min(1).max(CHANNELS.length),
  query: z.string().max(400).default(""),
  language: z.enum(LANGUAGES).default("es"),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

type SearchEvent = {
  status:
    | "started"
    | "channel_started"
    | "listen_done"
    | "import_started"
    | "import_done"
    | "channel_timeout"
    | "error"
    | "done";
  channel?: string;
  message?: string;
  data?: Record<string, unknown>;
};

type CommandConfig = {
  command: string;
  argsPrefix: string[];
};

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

let executionModeCache: "local" | "relay" | null = null;

async function canRunPython() {
  const cfg = commandName("python");
  const result = await runProcess(cfg, ["--version"], () => {}, 5_000);
  return result.code === 0;
}

async function shouldUseRelay() {
  if (executionModeCache) return executionModeCache === "relay";
  if (process.env.VERCEL) {
    executionModeCache = "relay";
    return true;
  }
  if (process.env.AGENTS_PYTHON_BIN) {
    executionModeCache = "local";
    return false;
  }
  const ok = await canRunPython();
  executionModeCache = ok ? "local" : "relay";
  return !ok;
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = searchSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Parametros invalidos.", details: result.error.flatten() }, { status: 400 });
  }
  const parsed = result.data;
  try {
    await assertClientAccess(prisma, parsed.clientId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cliente no autorizado." }, { status: 403 });
  }

  const { query, suggestions } = await buildQuery(parsed.clientId, parsed.query);

  if (await shouldUseRelay()) {
    const relayResponse = await relayFetch("/search/run", {
      method: "POST",
      body: JSON.stringify({
        clientId: parsed.clientId,
        channels: parsed.channels,
        query,
        language: parsed.language,
        limit: parsed.limit,
      }),
    });
    if (!relayResponse.ok || !relayResponse.body) {
      return NextResponse.json({ error: "Relay no disponible.", status: relayResponse.status }, { status: 502 });
    }
    return new Response(relayResponse.body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: SearchEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const totals = {
        itemsRead: 0,
        intakeRows: 0,
        createdOrProcessed: 0,
        duplicates: 0,
        discarded: 0,
        completedChannels: 0,
        timedOutChannels: 0,
        errors: 0,
      };

      try {
        send({
          status: "started",
          message: "Busqueda iniciada.",
          data: { channels: parsed.channels, language: parsed.language, limit: parsed.limit, query, suggestions },
        });

        for (const channel of parsed.channels) {
          send({ status: "channel_started", channel, message: `Buscando en ${channel}...` });
          const listen = await runProcess(commandName("python"), [
            join("agents", "social-listen.py"),
            "--channel", channel,
            "--query", query,
            "--limit", String(parsed.limit),
            "--client-id", parsed.clientId,
            "--language", parsed.language,
          ], (line, streamName) => {
            if (streamName === "stderr" && line.includes("ERROR")) {
              send({ status: "error", channel, message: line.slice(0, 500) });
            }
          }, SEARCH_CHANNEL_TIMEOUT_MS);

          if (listen.timedOut) {
            totals.timedOutChannels += 1;
            send({
              status: "channel_timeout",
              channel,
              message: `${channel} tardo demasiado. Pasando a la siguiente red.`,
              data: { timeoutMs: SEARCH_CHANNEL_TIMEOUT_MS },
            });
            continue;
          }

          const listenSummary = extractLastJson(listen.stdout) as any;
          if (listen.code !== 0 || !listenSummary) {
            totals.errors += 1;
            send({
              status: "error",
              channel,
              message: listen.stderr.trim() || "No se pudo leer el resumen de escucha.",
              data: { code: listen.code },
            });
            continue;
          }

          totals.itemsRead += Number(listenSummary.items_read || 0);
          totals.intakeRows += Number(listenSummary.intake_rows || 0);
          totals.discarded += Number(listenSummary.discarded_count || 0);
          send({
            status: "listen_done",
            channel,
            message: `${listenSummary.items_read || 0} items leidos, ${listenSummary.intake_rows || 0} candidatos.`,
            data: listenSummary,
          });

          send({ status: "import_started", channel, message: "Importando oportunidades nuevas..." });
          const imported = await runProcess(commandName("npx"), ["tsx", "scripts/import-opportunities.mts"], () => {});
          const importSummary = parseImportSummary(imported.stdout);
          if (imported.code !== 0) {
            totals.errors += 1;
            send({
              status: "error",
              channel,
              message: imported.stderr.trim() || importSummary.raw || "Fallo la importacion.",
              data: { code: imported.code },
            });
            continue;
          }

          totals.createdOrProcessed += importSummary.createdOrProcessed;
          totals.duplicates += importSummary.duplicates;
          totals.completedChannels += 1;
          send({
            status: "import_done",
            channel,
            message: `${importSummary.createdOrProcessed} procesadas, ${importSummary.duplicates} duplicadas.`,
            data: importSummary,
          });
        }

        send({
          status: "done",
          message: totals.createdOrProcessed > 0 ? "Busqueda finalizada." : "No se encontraron oportunidades nuevas.",
          data: { ...totals, suggestions },
        });
      } catch (error) {
        totals.errors += 1;
        send({
          status: "error",
          message: error instanceof Error ? error.message : "Error inesperado durante la busqueda.",
        });
        send({
          status: "done",
          message: "Busqueda interrumpida por un error interno.",
          data: { ...totals, suggestions },
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

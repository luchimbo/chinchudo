import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadSystemHealth } from "../system-health";

const now = new Date("2026-11-20T15:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

function fixture(overrides: { heartbeat?: Date | null; maintenance?: { at: Date; attempted: number; errors: number } | null; relay?: string; latest?: Date | null; blogs?: number; failed?: number; sources?: number; backup?: Date | null } = {}) {
  const values = {
    heartbeat: minutesAgo(1), maintenance: { at: minutesAgo(10), attempted: 10, errors: 1 }, relay: "https://worker.trycloudflare.com",
    latest: minutesAgo(30), blogs: 5, failed: 0, sources: 3, backup: minutesAgo(6 * 60) as Date | null, ...overrides,
  };
  const settings = [
    values.heartbeat ? { key: "cm.manual.worker.heartbeat", value: values.heartbeat.toISOString() } : null,
    values.maintenance ? { key: "cm.maintenance.last-run", value: JSON.stringify({ ...values.maintenance, at: values.maintenance.at.toISOString() }) } : null,
    { key: "blog_runtime_relay_url", value: values.relay },
    values.backup ? { key: "db.backup.last-run", value: JSON.stringify({ at: values.backup.toISOString(), rows: 1 }) } : null,
  ].filter(Boolean);
  const count = vi.fn(async ({ where }: { where: { status?: string } }) => where.status === "FAILED" ? values.failed : values.blogs);
  return {
    appSetting: { findMany: vi.fn(async () => settings) },
    opportunity: { findFirst: vi.fn(async () => values.latest ? { createdAt: values.latest } : null) },
    blogPublication: { count },
    monitoredSource: { count: vi.fn(async () => values.sources) },
  } as unknown as PrismaClient;
}

describe("estado del sistema en Inicio", () => {
  it("no muestra nada cuando todo funciona", async () => {
    expect(await loadSystemHealth(fixture(), "client", now)).toEqual([]);
  });

  it("avisa si el procesador de propuestas dejó de reportar", async () => {
    const alerts = await loadSystemHealth(fixture({ heartbeat: minutesAgo(5) }), "client", now);
    expect(alerts).toEqual([expect.objectContaining({ area: "cm", level: "error" })]);
  });

  it("avisa si la actualización automática no corre o falla en su mayoría", async () => {
    expect(await loadSystemHealth(fixture({ maintenance: { at: minutesAgo(90), attempted: 10, errors: 0 } }), "client", now))
      .toEqual([expect.objectContaining({ area: "cm", message: expect.stringContaining("más de una hora") })]);
    expect(await loadSystemHealth(fixture({ maintenance: { at: minutesAgo(5), attempted: 10, errors: 8 } }), "client", now))
      .toEqual([expect.objectContaining({ message: expect.stringContaining("8 de 10") })]);
  });

  it("avisa si no entran oportunidades nuevas en 24 horas", async () => {
    const alerts = await loadSystemHealth(fixture({ latest: minutesAgo(25 * 60) }), "client", now);
    expect(alerts).toEqual([expect.objectContaining({ area: "listening", href: "/monitoring" })]);
    expect(await loadSystemHealth(fixture({ latest: null, sources: 0 }), "client", now)).toEqual([]);
  });

  it("avisa por el blog solo si el cliente tiene blog", async () => {
    expect(await loadSystemHealth(fixture({ relay: "", failed: 2 }), "client", now)).toEqual([
      expect.objectContaining({ area: "blog", level: "error" }),
      expect.objectContaining({ area: "blog", message: expect.stringContaining("2 artículos fallaron") }),
    ]);
    expect(await loadSystemHealth(fixture({ relay: "", blogs: 0 }), "client", now)).toEqual([]);
  });

  it("avisa si la copia de seguridad de la base no se hace hace más de un día y medio", async () => {
    expect(await loadSystemHealth(fixture({ backup: minutesAgo(30 * 60) }), "client", now)).toEqual([]);
    expect(await loadSystemHealth(fixture({ backup: minutesAgo(40 * 60) }), "client", now))
      .toEqual([expect.objectContaining({ area: "backup", level: "warning" })]);
    expect(await loadSystemHealth(fixture({ backup: null }), "client", now))
      .toEqual([expect.objectContaining({ area: "backup" })]);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkPublishRateLimits } from "../publish-agent";
// @ts-expect-error El comando operativo comparte la política en un módulo JavaScript.
import { checkPublishRateLimits as checkScriptLimits } from "../../../scripts/publish-utils.mjs";

describe.each([
  ["panel", checkPublishRateLimits],
  ["comando", checkScriptLimits],
])("Límites de publicación: %s", (_name, check) => {
  function database(count: number) {
    return {
      appSetting: { findUnique: vi.fn(async ({ where }: { where: { key: string } }) => ({ value: where.key === "PUBLISH_DAILY_PER_ACCOUNT" ? "1" : "30" })) },
      publishingLog: {
        count: vi.fn(async () => count),
        findFirst: vi.fn(async () => ({ publishedAt: new Date() })),
      },
    };
  }

  it("permite YouTube aunque haya publicaciones recientes y se supere el cupo", async () => {
    const db = database(500);
    expect(await check(db as unknown as PrismaClient, "cuenta", "YouTube")).toEqual({ ok: true });
    expect(db.appSetting.findUnique).not.toHaveBeenCalled();
  });

  it("mantiene el cupo diario para otros canales", async () => {
    expect(await check(database(2) as unknown as PrismaClient, "cuenta", "reddit"))
      .toEqual({ ok: false, error: "rate_limited_daily" });
  });

  it("mantiene la espera entre publicaciones para otros canales", async () => {
    expect(await check(database(0) as unknown as PrismaClient, "cuenta", "reddit"))
      .toMatchObject({ ok: false, error: "rate_limited_spacing" });
  });
});

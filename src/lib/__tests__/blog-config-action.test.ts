import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), update: vi.fn(), get: vi.fn(), set: vi.fn(), access: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: mocks.access }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.get, setSetting: mocks.set }));
vi.mock("@/lib/db", () => ({ prisma: { client: { findUniqueOrThrow: mocks.client, update: mocks.update } } }));
import { updateLandingsConfig } from "@/app/(app)/(creador)/blog/configuracion/actions";

function form() {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ id: "pc", blogBaseUrl: "https://blog.pcmidicenter.com", storeUrl: "https://www.pcmidi.com.ar", generationIntervalHours: "24", generationLimit: "1", weeklyTarget: "7", blogDailyEnabled: "on", blogPublishTime: "12:00", blogAutoApprove: "on" })) fd.set(key, value);
  return fd;
}
beforeEach(() => { vi.resetAllMocks(); mocks.client.mockResolvedValue({ slug: "pcmidi" }); mocks.get.mockResolvedValue(JSON.stringify({ enabled: true, firstPublishDate: "2026-10-14" })); });

describe("configuración propia del blog", () => {
  it("guarda aprobación del blog sin modificar las opciones compartidas del cliente", async () => {
    await updateLandingsConfig(form());
    const data = mocks.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("autoApprove"); expect(data).not.toHaveProperty("autoPublish");
    const value = mocks.set.mock.calls.find(([key]) => key === "blog_daily_schedule:pc")![1];
    expect(JSON.parse(value)).toMatchObject({ autoApprove: true, enabled: true, publishTime: "12:00", firstPublishDate: "2026-10-14" });
  });
  it("una opción ausente conserva la revisión manual como valor predeterminado", async () => {
    const fd = form(); fd.delete("blogAutoApprove"); await updateLandingsConfig(fd);
    const value = mocks.set.mock.calls.find(([key]) => key === "blog_daily_schedule:pc")![1];
    expect(JSON.parse(value).autoApprove).toBe(false);
  });
  it("otros clientes conservan sus opciones y no reciben la configuración de PC MIDI", async () => {
    mocks.client.mockResolvedValue({ slug: "prestige-running" }); const fd = form(); fd.set("autoApprove", "on");
    await updateLandingsConfig(fd);
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ autoApprove: true, autoPublish: false });
    expect(mocks.set.mock.calls.some(([key]) => key.startsWith("blog_daily_schedule:"))).toBe(false);
  });
});

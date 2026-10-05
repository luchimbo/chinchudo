import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
const context = new AsyncLocalStorage();

export async function withBlogLease(prisma, clientId, callback) {
  const nested = context.getStore();
  if (nested?.clientId === clientId) { nested.assert(); return callback(nested); }
  const key = `blog_execution_lock:${clientId}`, owner = randomUUID();
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: "{}" }, update: {} });
  const row = await prisma.appSetting.findUnique({ where: { key } });
  let previous; try { previous = JSON.parse(row.value); } catch { previous = {}; }
  if (previous.expiresAt > Date.now()) return null;
  let value = JSON.stringify({ owner, expiresAt: Date.now() + 90_000 });
  let expiresAt = JSON.parse(value).expiresAt;
  const claim = await prisma.appSetting.updateMany({ where: { key, value: row.value }, data: { value } });
  if (!claim.count) return null;
  const controller = new AbortController();
  let lost = false, renewing = false;
  const lease = { clientId, signal: controller.signal, assert() { if (Date.now() >= expiresAt) { lost = true; controller.abort(); } if (lost) throw new Error("Se perdió la reserva de trabajo del blog. Se reintentará."); } };
  const timer = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try {
      const next = JSON.stringify({ owner, expiresAt: Date.now() + 90_000 });
      const renewed = await prisma.appSetting.updateMany({ where: { key, value }, data: { value: next } });
      if (!renewed.count) throw new Error("Lease lost");
      value = next;
      expiresAt = JSON.parse(next).expiresAt;
    } catch { lost = true; controller.abort(); }
    finally { renewing = false; }
  }, 20_000);
  timer.unref();
  try { return await context.run(lease, () => callback(lease)); }
  finally {
    clearInterval(timer);
    while (renewing) await new Promise(resolve => setTimeout(resolve, 10));
    await prisma.appSetting.updateMany({ where: { key, value }, data: { value: "{}" } }).catch(() => {});
  }
}

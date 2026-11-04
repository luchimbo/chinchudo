import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { signJwt } from "../src/lib/auth-crypto";
nextEnv.loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(".tmp/browser-check/node_modules/playwright"));
const executablePath = process.env.PERFORMANCE_CHROMIUM || resolve(process.env.LOCALAPPDATA!, "ms-playwright/chromium-1228/chrome-win64/chrome.exe");
const base = process.env.PERFORMANCE_BASE || "http://localhost:3148";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Local test server required.");
const db = new PrismaClient(), checks: string[] = [], errors: string[] = [];
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); checks.push(message); console.info(message); };
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const user = await db.user.findFirstOrThrow({ where: { client: { slug: "pcmidi" } }, select: { email: true, role: true, tokenVersion: true, clientId: true } });
  const token = (version = user.tokenVersion) => signJwt({ email: user.email, role: user.role, clientId: user.clientId, clientSlug: "pcmidi", tv: version }, process.env.AUTH_SECRET!, 1800);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "auth_session", value: token(), url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (error: Error) => errors.push(error.message));
  let historyReads = 0, detailReads = 0;
  page.on("request", (request: { url(): string }) => { if (request.url().includes("/api/cm/opportunities/")) detailReads++; if (/\/api\/cm\/opportunities\/.+history=1/.test(request.url())) historyReads++; });
  await page.goto(`${base}/asistente-cm?client=pcmidi`, { waitUntil: "networkidle", timeout: 90_000 });
  assert(await page.getByRole("heading", { name: "Asistente CM", exact: true }).isVisible(), "CM opens with authenticated session");
  assert(await page.getByRole("link", { name: "Abrir fuente", exact: true }).count() <= 20, "CM initial page contains at most 20 opportunities");
  assert(historyReads === 0, "Conversations are not requested on initial load");
  const publicationOnly = process.argv.includes("--publication-only");
  if (!publicationOnly) {
  const openChat = page.getByRole("button", { name: "Abrir conversación y variantes" }).first();
  if (await openChat.count()) {
    const historyResponse = page.waitForResponse((response: { url(): string }) => /\/api\/cm\/opportunities\/.+history=1/.test(response.url()));
    await openChat.click();
    await historyResponse;
    assert(historyReads > 0, "Conversation is fetched only when opened");
  }
  const editForm = page.locator("form").filter({ has: page.locator('textarea[name="editedText"]') }).first();
  if (await editForm.count()) {
    const opportunityId = await editForm.locator('input[name="opportunityId"]').inputValue();
    const stored = await (await context.request.get(`${base}/api/cm/opportunities/${opportunityId}?client=pcmidi&history=1`)).json();
    const beforeMetadata = detailReads;
    const metadata = { id: opportunityId, status: "error", error: "", revision: stored.opportunity.coverageRevision || "", primaryResponseId: stored.opportunity.responses[0].id, latestResponseId: stored.opportunity.responses[0].id };
    await page.evaluate((row: object) => window.dispatchEvent(new CustomEvent("cm-coverage-updated", { detail: { client: "pcmidi", rows: [row] } })), metadata);
    await page.locator(`#op-${opportunityId}`).getByText("No se pudo actualizar.", { exact: false }).waitFor();
    assert(detailReads === beforeMetadata, "Coverage metadata updates a card without refetching its conversation");
    await page.evaluate((row: object) => window.dispatchEvent(new CustomEvent("cm-coverage-updated", { detail: { client: "pcmidi", rows: [row] } })), { ...metadata, status: stored.opportunity.freshness });
    const originalText = await editForm.locator("textarea").inputValue();
    await page.route(`**/api/cm/opportunities/${opportunityId}?*`, async (route: any) => {
      const updated = structuredClone(stored); updated.opportunity.responses[0].id = "verification-new-proposal"; updated.opportunity.responses[0].text = "Nueva propuesta remota";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(updated) });
    });
    await editForm.locator("textarea").fill("Edición local que debe conservarse");
    await page.waitForTimeout(100);
    const changed = page.waitForResponse((r: any) => r.url().includes(`/api/cm/opportunities/${opportunityId}?`));
    await page.evaluate((id: string) => window.dispatchEvent(new CustomEvent("cm-opportunity-changed", { detail: id })), opportunityId);
    await changed;
    await page.getByText("La oportunidad cambió.", { exact: false }).waitFor();
    assert(await editForm.locator("textarea").inputValue() === "Edición local que debe conservarse", "Background completion preserves unsaved operator edits");
    await page.getByText("Ver propuestas guardadas", { exact: true }).click();
    assert(await page.getByText("Nueva propuesta remota", { exact: true }).isVisible(), "New stored proposals remain reviewable while a local edit is dirty");
    await editForm.locator("textarea").fill(originalText);
    await page.unroute(`**/api/cm/opportunities/${opportunityId}?*`);
    let submitted = false, jobReads = 0;
    await page.route("**/api/cm/jobs?*", async (route: any) => { jobReads++; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workerOnline: false, jobs: submitted ? [{ id: "verification-job", opportunityId, status: "QUEUED", updatedAt: new Date().toISOString(), error: "" }] : [] }) }); });
    await page.route("**/api/cm/jobs", async (route: any) => { submitted = true; await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ id: "verification-job", status: "QUEUED" }) }); });
    page.once("dialog", (dialog: any) => dialog.accept());
    await page.getByRole("button", { name: "↻ Regenerar con lo aprendido" }).first().click();
    await page.getByText("En espera del procesador", { exact: true }).waitFor({ timeout: 30_000 });
    assert(submitted, "Manual regeneration creates a background request without waiting for the model");
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    const beforePause = jobReads;
    await page.waitForTimeout(3500);
    assert(jobReads === beforePause, "Job polling pauses in a hidden tab");
    const resumed = page.waitForResponse((r: any) => r.url().includes("/api/cm/jobs?"));
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
    await resumed;
    assert(jobReads > beforePause, "Job polling resumes when the tab becomes visible");
    await page.unroute("**/api/cm/jobs"); await page.unroute("**/api/cm/jobs?*");
  }
  }
  const publishButton = page.getByRole("button", { name: "Publicar en YouTube", exact: true }).first();
  if (await publishButton.count()) {
    // Mock the Next 14 server-action Flight tuple, before any request can reach
    // a real action or publishing service. No external comment is ever sent.
    let actionCalls = 0;
    const publicationMock = async (route: any) => {
      if (route.request().method() !== "POST") return route.continue();
      if (!route.request().headers()["next-action"]) return route.abort();
      actionCalls++;
      const result = actionCalls === 1 ? { success: false, reconnectRequired: false, verificationRequired: true, message: "YouTube no confirmó el resultado. Revisá si el comentario se publicó antes de volver a intentar." } : { success: true, message: "Comprobación guardada." };
      await route.fulfill({ status: 200, contentType: "text/x-component", body: `0:${JSON.stringify([result, [null, null]])}\n` });
    };
    await page.route("**/*", publicationMock);
    await publishButton.click();
    await page.getByRole("link", { name: "Revisar el comentario en YouTube", exact: true }).waitFor();
    assert(await publishButton.isDisabled(), "Ambiguous publication blocks another send");
    const unlock = page.getByRole("button", { name: "Habilitar otro intento", exact: true });
    assert(await unlock.isDisabled(), "Retry requires an explicit human verification");
    await page.getByRole("checkbox", { name: "Revisé YouTube y confirmé" }).check();
    await unlock.click();
    await publishButton.waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Habilitar otro intento"));
    assert(await publishButton.isEnabled() && actionCalls === 2, "Verification enables a later attempt without sending a comment");
    await page.unroute("**/*", publicationMock);
  }
  if (!publicationOnly) {
  const nextPage = page.getByRole("navigation", { name: "Páginas de oportunidades" }).getByRole("link", { name: "Siguiente" });
  if (await nextPage.count()) { await nextPage.click(); await page.waitForURL(/page=2/, { timeout: 60_000 }); assert(page.url().includes("page=2"), "CM server pagination navigates to page 2"); }
  const forbidden = await context.request.get(`${base}/api/cm/jobs?client=prestige-running`);
  assert(forbidden.status() === 403, "Jobs API rejects another tenant");
  const searches = await context.request.get(`${base}/api/catalog/search?client=pcmidi&kind=cm-product&q=mini`);
  const searchData = await searches.json();
  assert(searches.ok() && searchData.items.length <= 20, "Product search is bounded to 20 results");
  for (const route of ["/blog/calendario", "/blog/articulos", "/blog/configuracion", "/blog/fuentes", "/blog/diseno", "/historial"]) {
    const response = await page.goto(`${base}${route}?client=pcmidi`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    assert(response?.status() === 200, `${route} renders successfully`);
  }
  await page.goto(`${base}/blog/calendario?client=pcmidi`, { waitUntil: "networkidle", timeout: 90_000 });
  assert(await page.locator("[data-calendar-day]").count() >= 28, "Blog calendar renders its month grid");
  await page.screenshot({ path: "reports/module-performance-calendar-desktop.png", fullPage: true });
  const article = await db.landing.findFirst({ where: { clientId: user.clientId, contentType: { in: ["GUIDE", "PILLAR"] }, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (article) {
    await page.goto(`${base}/blog/articulos/${article.id}?client=pcmidi`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator('[contenteditable="true"]').first().waitFor({ timeout: 30_000 });
    assert(await page.locator('[contenteditable="true"]').count() > 0, "Deferred article editor loads and remains editable");
    const state = await context.request.get(`${base}/api/blog/articles/${article.id}/state?client=prestige-running`);
    assert(state.status() === 403, "Article state rejects another tenant");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/asistente-cm?client=pcmidi`, { waitUntil: "networkidle", timeout: 90_000 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "CM fits a mobile viewport");
  await page.screenshot({ path: "reports/module-performance-cm-mobile.png", fullPage: true });
  await page.goto(`${base}/blog/calendario?client=pcmidi`, { waitUntil: "networkidle", timeout: 90_000 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Blog calendar fits a mobile viewport");
  await page.screenshot({ path: "reports/module-performance-calendar-mobile.png", fullPage: true });
  const revoked = await browser.newContext();
  await revoked.addCookies([{ name: "auth_session", value: token(user.tokenVersion + 1), url: base }]);
  const rejected = await revoked.request.get(`${base}/api/cm/jobs?client=pcmidi`);
  assert(rejected.status() === 401, "A revoked token is rejected on the next request");
  await revoked.close();
  }
  await context.close();
  assert(!errors.length, "No browser runtime errors");
} catch (error) { errors.push(error instanceof Error ? error.message : "ui-verification-failed"); process.exitCode = 1; }
finally {
  await writeFile(`reports/module-performance-ui-${process.argv.includes("--publication-only") ? "publication" : "verification"}.json`, JSON.stringify({ at: new Date().toISOString(), base, checks, errors, publishing: "No real publication or generation was performed." }, null, 2));
  await browser.close(); await db.$disconnect();
}
console.info(JSON.stringify({ checks: checks.length, errors }));

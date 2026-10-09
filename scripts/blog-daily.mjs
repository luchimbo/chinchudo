import { randomUUID } from "node:crypto";
import { inspectBlogArticle } from "../src/lib/blog-evidence.mjs";
import { editorialIntentForDate } from "../src/lib/blog-quality.mjs";

export function createBlogDaily({ prisma, runBlogPython, fetchUrl = fetch, now = () => new Date(), generationClients = new Set(), log = console, withLease = async (_id, fn) => fn(), catalogPending = async () => false, inspect = (clientId, content, id) => inspectBlogArticle(prisma, clientId, content, id) }) {
  let running = false;
  const dateValue = (day) => new Date(`${day}T00:00:00.000Z`);
  const shiftDate = (day, offset) => { const date = dateValue(day); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
  function argentinaNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now()).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  const errors = (quality) => quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ").slice(0, 1000);
  const parseContent = (landing) => JSON.parse(landing.htmlContent);
  const landingFields = (content) => ({ keyword: content.keyword, titulo: content.h1 || content.titulo, seoTitle: content.seo_title, seoDescription: content.meta_description, htmlContent: JSON.stringify(content), sourceRefs: content.source_refs || [] });
  async function restorePrivateDraft(landing) {
    const current = await prisma.landing.findUnique({ where: { id: landing.id } });
    const content = parseContent(current);
    delete content.published_at; delete content.publication_token;
    await prisma.landing.update({ where: { id: landing.id }, data: { htmlContent: JSON.stringify(content), status: "DRAFT", publishedAt: null } });
  }

  async function validate(client, landing, content) {
    if (landing.slug.startsWith("ejemplo-calendario-")) throw new Error("Los datos de ejemplo no pueden publicarse.");
    const quality = await inspect(client.id, { ...content, id: landing.id }, landing.id);
    content.editorial_quality = quality;
    return quality;
  }

  async function deployVerified(client, landing, content) {
    if (!client.blogBaseUrl?.trim()) throw new Error("Configurá la URL pública del blog antes de desplegar.");
    if (!landing.contentCluster?.slug) throw new Error("El artículo no tiene cluster editorial.");
    const token = randomUUID();
    content.publication_token = token;
    await prisma.landing.update({ where: { id: landing.id }, data: landingFields(content) });
    await runBlogPython(["rebuild-links"], client.id);
    await runBlogPython(["deploy", "--base-url", client.blogBaseUrl], client.id, 600_000);
    const url = `${client.blogBaseUrl.replace(/\/$/, "")}/guias/${landing.contentCluster.slug}/${landing.slug}/`;
    const response = await fetchUrl(`${url}?revision=${token}`, { signal: AbortSignal.timeout(20_000), headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`La URL pública respondió ${response.status}: ${url}`);
    const html = await response.text();
    if (!html.includes(`<meta name="editorial-revision" content="${token}">`)) throw new Error("La URL pública todavía no contiene la versión desplegada.");
    return url;
  }

  async function deployEditedBlogArticle(client) {
    const revision = await prisma.blogPublication.findFirst({ where: { clientId: client.id, status: "PUBLISHED", needsDeploy: true, revisionAttempts: { lt: 3 } }, include: { landing: { include: { contentCluster: { select: { slug: true } } } } }, orderBy: { updatedAt: "asc" } });
    if (!revision?.landing) return deployExistingArticleRevision(client);
    const claimed = await prisma.blogPublication.updateMany({ where: { id: revision.id, status: "PUBLISHED", needsDeploy: true, revisionAttempts: { lt: 3 } }, data: { status: "PUBLISHING", revisionAttempts: { increment: 1 } } });
    if (!claimed.count) return false;
    const landing = await prisma.landing.findUnique({ where: { id: revision.landingId }, include: { contentCluster: { select: { slug: true } } } });
    let original;
    try {
      original = parseContent(landing);
      const candidate = { ...(original.pending_revision?.content || original) };
      delete candidate.pending_revision;
      delete candidate.deployment_backup;
      const quality = await validate(client, landing, candidate);
      if (!quality.publishable) {
        await prisma.landing.update({ where: { id: landing.id }, data: { htmlContent: JSON.stringify({ ...original, pending_revision: { content: candidate } }) } });
        await prisma.blogPublication.update({ where: { id: revision.id }, data: { status: "PUBLISHED", needsDeploy: false, revisionAttempts: 0, lastError: errors(quality) } });
        return true;
      }
      const live = { ...original }; delete live.pending_revision;
      candidate.deployment_backup = live;
      candidate.pending_revision = { content: { ...candidate, deployment_backup: undefined } };
      await deployVerified(client, landing, candidate);
      delete candidate.deployment_backup; delete candidate.pending_revision;
      await prisma.landing.update({ where: { id: landing.id }, data: landingFields(candidate) });
      await prisma.blogPublication.update({ where: { id: revision.id }, data: { status: "PUBLISHED", needsDeploy: false, revisionAttempts: 0, lastError: "" } });
    } catch (error) {
      if (original && landing) await prisma.landing.update({ where: { id: landing.id }, data: landingFields(original) });
      await prisma.blogPublication.update({ where: { id: revision.id }, data: { status: "PUBLISHED", needsDeploy: true, lastError: String(error).slice(-1000) } });
      log.error("[blog] No se pudo actualizar el artículo:", error);
    }
    return true;
  }

  // Publicación explícita del operador, independiente del horario automático.
  async function publishBlogArticle({ id, clientId, expectedUpdatedAt }, onAccepted = () => {}) {
    if (await catalogPending(clientId)) throw new Error("El catálogo se está actualizando. Reintentá en unos minutos.");
    const result = await withLease(clientId, async () => {
      const [client, slot] = await Promise.all([
        prisma.client.findUnique({ where: { id: clientId }, select: { id: true, active: true, blogBaseUrl: true } }),
        prisma.blogPublication.findUnique({ where: { id }, include: { landing: { include: { contentCluster: { select: { slug: true } } } } } }),
      ]);
      if (!client?.active || !slot?.landing || slot.clientId !== clientId) throw new Error("Artículo no encontrado para este cliente.");
      if (slot.requiresApproval) throw new Error("Aprobá el borrador antes de publicarlo.");
      if (!["READY", "FAILED"].includes(slot.status)) throw new Error("El artículo no está listo para publicar. Recargá el calendario.");
      if (!client.blogBaseUrl?.trim()) throw new Error("Configurá la URL pública del blog antes de publicar.");
      if (slot.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("El artículo cambió. Recargá el calendario antes de publicar.");
      const claimed = await prisma.blogPublication.updateMany({
        where: { id, clientId, updatedAt: slot.updatedAt, requiresApproval: false, status: { in: ["READY", "FAILED"] }, landing: { updatedAt: slot.landing.updatedAt } },
        data: { status: "PUBLISHING", attempts: { increment: 1 }, lastError: "" },
      });
      if (!claimed.count) throw new Error("El artículo cambió o ya se está publicando. Recargá el calendario.");
      onAccepted();
      await publishClaimedArticle(client, slot);
      return true;
    });
    if (result === null) throw new Error("El blog está ocupado. Reintentá en unos minutos.");
  }

  async function publishClaimedArticle(client, slot) {
    let landing;
    try {
      landing = await prisma.landing.findUnique({ where: { id: slot.landingId }, include: { contentCluster: { select: { slug: true } } } });
      const content = parseContent(landing);
      const quality = await validate(client, landing, content);
      if (!quality.publishable) {
        await prisma.landing.update({ where: { id: landing.id }, data: { htmlContent: JSON.stringify(content), status: "DRAFT", publishedAt: null } });
        await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "FAILED", attempts: 3, lastError: errors(quality) } });
        return;
      }
      const day = slot.scheduledDate.toISOString().slice(0, 10);
      if (content.editorial_intent !== editorialIntentForDate(day)) throw new Error("La intención del artículo no coincide con la fecha; reprogramá para conservar el equilibrio.");
      content.published_at = now().toISOString();
      await prisma.landing.update({ where: { id: landing.id }, data: { status: "PUBLISHED", publishedAt: now() } });
      const url = await deployVerified(client, landing, content);
      await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "PUBLISHED", publishedAt: now(), lastError: "" } });
      log.log(`[blog] Artículo publicado: ${url}`);
    } catch (error) {
      if (landing) await restorePrivateDraft(landing);
      await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "FAILED", lastError: String(error).slice(-1000) } });
      log.error("[blog] No se pudo publicar:", error);
    }
  }

  async function deployExistingArticleRevision(client) {
    const candidates = await prisma.landing.findMany({ where: { clientId: client.id, status: "PUBLISHED", contentType: { in: ["GUIDE", "PILLAR"] }, blogPublication: { is: null }, htmlContent: { contains: '"pending_revision"' } }, include: { contentCluster: { select: { slug: true } } }, orderBy: { updatedAt: "asc" }, take: 50 });
    const landing = candidates.find((l) => { const c = parseContent(l); return c.pending_revision?.publishable && Number(c.revision_attempts || 0) < 3 && !(Date.parse(c.deployment_started_at || "") > now().getTime() - 15 * 60000); });
    if (!landing) return false;
    let original = parseContent(landing);
    if (!original.pending_revision?.publishable || Number(original.revision_attempts || 0) >= 3 || Date.parse(original.deployment_started_at || "") > now().getTime() - 15 * 60000) return false;
    // Ante un reinicio se recupera la versión pública anterior de la copia.
    if (original.deployment_backup) original = { ...original.deployment_backup, pending_revision: original.pending_revision, revision_attempts: original.revision_attempts };
    const claimed = await prisma.landing.updateMany({ where: { id: landing.id, updatedAt: landing.updatedAt }, data: { htmlContent: JSON.stringify({ ...original, deployment_started_at: now().toISOString(), revision_attempts: Number(original.revision_attempts || 0) + 1 }) } });
    if (!claimed.count) return false;
    const candidate = { ...original.pending_revision.content };
    delete candidate.pending_revision; delete candidate.deployment_started_at; delete candidate.deployment_backup;
    try {
      const quality = await validate(client, landing, candidate);
      if (!quality.publishable) {
        await prisma.landing.update({ where: { id: landing.id }, data: { htmlContent: JSON.stringify({ ...original, deployment_error: errors(quality), pending_revision: { content: candidate, publishable: false } }) } });
        return true;
      }
      const live = { ...original }; delete live.pending_revision;
      candidate.deployment_backup = live;
      candidate.pending_revision = { content: { ...candidate, deployment_backup: undefined }, publishable: true };
      candidate.deployment_started_at = now().toISOString();
      candidate.revision_attempts = Number(original.revision_attempts || 0) + 1;
      await deployVerified(client, landing, candidate);
      delete candidate.deployment_backup; delete candidate.pending_revision; delete candidate.deployment_started_at;
      candidate.revision_attempts = 0; candidate.deployment_error = "";
      await prisma.landing.update({ where: { id: landing.id }, data: landingFields(candidate) });
    } catch (error) {
      await prisma.landing.update({ where: { id: landing.id }, data: landingFields({ ...original, revision_attempts: Number(original.revision_attempts || 0) + 1, deployment_error: String(error).slice(-1000) }) });
      log.error("[blog] No se pudo desplegar la revisión:", error);
    }
    return true;
  }

  async function recoverInterrupted(clientId) {
    const stale = await prisma.blogPublication.findMany({ where: { clientId, status: "PUBLISHING", updatedAt: { lt: new Date(now().getTime() - 15 * 60_000) } }, include: { landing: true } });
    for (const slot of stale) {
      if (slot.needsDeploy && slot.publishedAt) {
        if (slot.landing) {
          const content = parseContent(slot.landing);
          if (content.deployment_backup) await prisma.landing.update({ where: { id: slot.landingId }, data: landingFields({ ...content.deployment_backup, pending_revision: content.pending_revision }) });
        }
        await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "PUBLISHED", lastError: "Actualización interrumpida; se reintentará." } });
      } else {
        if (slot.landing) await restorePrivateDraft(slot.landing);
        await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "FAILED", lastError: "Publicación interrumpida; se reintentará." } });
      }
    }
  }

  async function runDailyBlogCalendar() {
    if (running) return;
    running = true;
    try {
      const client = await prisma.client.findUnique({ where: { slug: "pcmidi" }, select: { id: true, active: true, blogBaseUrl: true } });
      if (!client?.active) return;
      const key = `blog_daily_schedule:${client.id}`;
      const setting = await prisma.appSetting.findUnique({ where: { key } });
      let config; try { config = JSON.parse(setting?.value || "{}"); } catch { return; }
      await recoverInterrupted(client.id);
      const local = argentinaNow();
      const active = config.enabled && client.blogBaseUrl?.trim() && /^([01]\d|2[0-3]):[0-5]\d$/.test(config.publishTime || "");
      // Con la publicación activa se mantienen 14 días reservados; las fechas
      // sumadas a mano desde el calendario se escriben aunque esté apagada.
      const start = shiftDate(local.date, 1);
      for (let offset = 0; active && offset < 14; offset += 1) {
        const day = shiftDate(start, offset);
        await prisma.blogPublication.upsert({ where: { clientId_scheduledDate: { clientId: client.id, scheduledDate: dateValue(day) } }, create: { clientId: client.id, scheduledDate: dateValue(day) }, update: {} });
      }
      await prisma.blogPublication.updateMany({ where: { clientId: client.id, requiresApproval: false, scheduledDate: { lt: dateValue(local.date) }, status: { in: ["PLANNED", "READY"] } }, data: { status: "SKIPPED", lastError: "La fecha pasó sin publicación; reprogramá el artículo." } });
      const due = await prisma.blogPublication.findUnique({ where: { clientId_scheduledDate: { clientId: client.id, scheduledDate: dateValue(local.date) } }, include: { landing: { include: { contentCluster: { select: { slug: true } } } } } });
      if (active && (!config.firstPublishDate || local.date >= config.firstPublishDate) && local.time >= config.publishTime && due?.landing && !due.requiresApproval && ["READY", "FAILED"].includes(due.status) && due.attempts < 3) {
        const claimed = await prisma.blogPublication.updateMany({ where: { id: due.id, requiresApproval: false, status: { in: ["READY", "FAILED"] }, attempts: { lt: 3 } }, data: { status: "PUBLISHING", attempts: { increment: 1 }, lastError: "" } });
        if (claimed.count) await publishClaimedArticle(client, due);
        return;
      }
      if (await deployEditedBlogArticle(client)) return;
      if (generationClients.has("pcmidi")) return;
      const empty = await prisma.blogPublication.findFirst({ where: { clientId: client.id, scheduledDate: { gte: dateValue(start) }, analysisRunId: null, landingId: null, status: { in: ["PLANNED", "FAILED"] }, attempts: { lt: 3 } }, orderBy: { scheduledDate: "asc" } });
      if (!empty) return;
      generationClients.add("pcmidi");
      const generationClaim = await prisma.blogPublication.updateMany({ where: { id: empty.id, updatedAt: empty.updatedAt, landingId: null, attempts: empty.attempts, status: { in: ["PLANNED", "FAILED"] } }, data: { attempts: { increment: 1 }, status: "PLANNED", lastError: "" } });
      if (!generationClaim.count) { generationClients.delete("pcmidi"); return; }
      try {
        const day = empty.scheduledDate.toISOString().slice(0, 10);
        await runBlogPython(["generate", "--limit", "1", "--schedule-date", day, "--max-seconds", "180"], client.id, 240_000);
        const result = await prisma.blogPublication.findUnique({ where: { id: empty.id } });
        if (result?.status === "FAILED" && result.landingId) return;
        if (result?.status !== "READY") throw new Error("El generador no produjo un artículo válido para esta fecha.");
        log.log(`[blog] Artículo preparado para ${day}`);
      } catch (error) {
        await prisma.blogPublication.update({ where: { id: empty.id }, data: { status: "FAILED", lastError: String(error).slice(-1000) } });
      } finally { generationClients.delete("pcmidi"); }
    } catch (error) { log.error("[blog] Calendario editorial:", error); }
    finally { running = false; }
  }
  const runLeasedCalendar = async () => {
    // Las publicaciones manuales también pueden pertenecer a otros clientes.
    const interrupted = await prisma.blogPublication.findMany({ where: { status: "PUBLISHING", updatedAt: { lt: new Date(now().getTime() - 15 * 60_000) } }, select: { clientId: true } });
    for (const clientId of new Set(interrupted.map(slot => slot.clientId))) {
      await withLease(clientId, () => recoverInterrupted(clientId));
    }
    const client = await prisma.client.findUnique({ where: { slug: "pcmidi" }, select: { id: true } });
    if (client && !(await catalogPending(client.id))) return withLease(client.id, runDailyBlogCalendar);
  };
  return { runDailyBlogCalendar: runLeasedCalendar, deployEditedBlogArticle, publishBlogArticle };
}

import { randomUUID } from "node:crypto";
import { inspectBlogArticle } from "../src/lib/blog-evidence.mjs";
import { editorialIntentForDate } from "../src/lib/blog-quality.mjs";
import { nextFreeEditorialDay, withDateHistory } from "../src/lib/blog-free-slot.mjs";
import { newPreparation, setPreparationPhase, failPreparation, recoverPreparations } from "./blog-preparation.mjs";

/** Traduce el plan guardado del día a argumentos del generador, sin valores inválidos. */
export function dayPlanArgs(preparation) {
  const value = preparation && typeof preparation === "object" && !Array.isArray(preparation) ? preparation : {};
  const text = (field, max) => typeof value[field] === "string" ? value[field].replace(/\s+/g, " ").trim().slice(0, max) : "";
  const productId = text("productId", 200);
  const competitor = text("competitor", 60);
  const competitorNotes = competitor ? text("competitorNotes", 300) : "";
  const excluded = Array.isArray(value.excludedProductIds) ? [...new Set(value.excludedProductIds.filter(id => typeof id === "string" && id && !id.includes(",")))] : [];
  return {
    competitor,
    metadata: { ...(productId ? { productId } : {}), ...(excluded.length ? { excludedProductIds: excluded } : {}), ...(competitor ? { competitor } : {}), ...(competitorNotes ? { competitorNotes } : {}) },
    args: [...(productId ? ["--product-id", productId] : []), ...(excluded.length ? ["--exclude-products", excluded.join(",")] : []), ...(competitor ? ["--competitor", competitor] : []), ...(competitorNotes ? ["--competitor-notes", competitorNotes] : [])],
  };
}

export function createBlogDaily({ prisma, runBlogPython, targetClientSlug = "pcmidi", fetchUrl = fetch, now = () => new Date(), generationClients = new Set(), log = console, withLease = async (_id, fn) => fn(), catalogPending = async () => false, inspect = (clientId, content, id) => inspectBlogArticle(prisma, clientId, content, id) }) {
  let running = false;
  let lastStartedAt = null, lastCompletedAt = null, lastFailure = false, blockedByCatalog = false;
  let lastTickAt = null, gate = "IDLE";
  const dateValue = (day) => new Date(`${day}T00:00:00.000Z`);
  const shiftDate = (day, offset) => { const date = dateValue(day); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
  // La hora local es la del mercado de cada cliente (Buenos Aires si no configuró otra).
  const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
  function clientTimezone(policy) {
    const zone = policy?.businessMarket?.timezone;
    if (typeof zone !== "string") return DEFAULT_TIMEZONE;
    try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return zone; } catch { return DEFAULT_TIMEZONE; }
  }
  function argentinaNow(policy) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: clientTimezone(policy), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now()).map((p) => [p.type, p.value]));
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
    await setTranslationsStatus(landing.id, "PUBLISHED", "DRAFT");
  }
  // Las traducciones no tienen fecha propia: acompañan el estado público del original.
  const translationWhere = (landingId) => ({ blogPublication: { is: null }, OR: [{ htmlContent: { contains: `"translation_of":"${landingId}"` } }, { htmlContent: { contains: `"translation_of": "${landingId}"` } }] });
  async function setTranslationsStatus(landingId, from, to) {
    return prisma.landing.updateMany({ where: { ...translationWhere(landingId), status: from }, data: { status: to, publishedAt: to === "PUBLISHED" ? now() : null } });
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
    if ((await prisma.landing.findUnique({ where: { id: landing.id }, select: { status: true } }))?.status === "PUBLISHED") await setTranslationsStatus(landing.id, "DRAFT", "PUBLISHED");
    await runBlogPython(["rebuild-links"], client.id);
    await runBlogPython(["deploy", "--base-url", client.blogBaseUrl], client.id, 600_000);
    const locale = ["en", "de"].includes(content.language) ? `/${content.language}` : "";
    const url = `${client.blogBaseUrl.replace(/\/$/, "")}${locale}/guias/${landing.contentCluster.slug}/${landing.slug}/`;
    const response = await fetchUrl(`${url}?revision=${token}`, { signal: AbortSignal.timeout(20_000), headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`La URL pública respondió ${response.status}: ${url}`);
    const html = await response.text();
    if (!html.includes(`<meta name="editorial-revision" content="${token}">`)) throw new Error("La URL pública todavía no contiene la versión desplegada.");
    await prisma.landing.update({ where: { id: landing.id }, data: { publicPreviewUrl: url } });
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
        await prisma.blogPublication.update({ where: { id: revision.id }, data: { status: "PUBLISHED", needsDeploy: false, revisionAttempts: 0, lastError: errors(quality), errorCode: "QUALITY_BLOCKED" } });
        return true;
      }
      const live = { ...original }; delete live.pending_revision;
      candidate.deployment_backup = live;
      candidate.pending_revision = { content: { ...candidate, deployment_backup: undefined } };
      await deployVerified(client, landing, candidate);
      delete candidate.deployment_backup; delete candidate.pending_revision;
      await prisma.landing.update({ where: { id: landing.id }, data: landingFields(candidate) });
      await prisma.blogPublication.update({ where: { id: revision.id }, data: { status: "PUBLISHED", needsDeploy: false, revisionAttempts: 0, lastError: "", errorCode: "" } });
    } catch (error) {
      if (original && landing) await prisma.landing.update({ where: { id: landing.id }, data: landingFields(original) });
      await prisma.blogPublication.update({ where: { id: revision.id }, data: { status: "PUBLISHED", needsDeploy: true, lastError: String(error).slice(-1000), errorCode: "DEPLOYMENT_FAILED" } });
      log.error("[blog] No se pudo actualizar el artículo:", error);
    }
    return true;
  }

  // Publicación explícita del operador, independiente del horario automático.
  async function publishBlogArticle({ id, clientId, expectedUpdatedAt }, onAccepted = () => {}) {
    if (await catalogPending(clientId)) throw new Error("El catálogo se está actualizando. Reintentá en unos minutos.");
    const result = await withLease(clientId, async () => {
      const [client, slot] = await Promise.all([
        prisma.client.findUnique({ where: { id: clientId }, select: { id: true, active: true, blogBaseUrl: true, responsePolicy: true } }),
        prisma.blogPublication.findUnique({ where: { id }, include: { landing: { include: { contentCluster: { select: { slug: true } } } } } }),
      ]);
      if (!client?.active || !slot?.landing || slot.clientId !== clientId) throw new Error("Artículo no encontrado para este cliente.");
      if (slot.requiresApproval) throw new Error("Aprobá el borrador antes de publicarlo.");
      if (!["READY", "FAILED"].includes(slot.status)) throw new Error("El artículo no está listo para publicar. Recargá el calendario.");
      if (!client.blogBaseUrl?.trim()) throw new Error("Configurá la URL pública del blog antes de publicar.");
      if (slot.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("El artículo cambió. Recargá el calendario antes de publicar.");
      const claimed = await prisma.blogPublication.updateMany({
        where: { id, clientId, updatedAt: slot.updatedAt, requiresApproval: false, status: { in: ["READY", "FAILED"] }, landing: { updatedAt: slot.landing.updatedAt } },
        data: { status: "PUBLISHING", attempts: { increment: 1 }, lastError: "", errorCode: "" },
      });
      if (!claimed.count) throw new Error("El artículo cambió o ya se está publicando. Recargá el calendario.");
      onAccepted();
      await publishClaimedArticle(client, slot);
      return true;
    });
    if (result === null) throw new Error("El blog está ocupado. Reintentá en unos minutos.");
  }

  // Un artículo publicado antes de su fecha pasa a ocupar hoy; lo que estaba para hoy se reubica
  // en el próximo día libre con la misma intención editorial (la paridad del día la define).
  async function adoptToday(client, slot, day) {
    const today = argentinaNow(client.responsePolicy).date;
    if (day <= today) return;
    const upcoming = await prisma.blogPublication.findMany({ where: { clientId: client.id, scheduledDate: { gte: dateValue(today) } } });
    const byDate = new Map(upcoming.map((entry) => [entry.scheduledDate.toISOString().slice(0, 10), entry]));
    const current = byDate.get(today);
    // Si hoy ya salió otro artículo, este conserva su fecha: un solo artículo por día.
    if (current && ["PUBLISHING", "PUBLISHED"].includes(current.status)) return;
    const displacedTo = current ? nextFreeEditorialDay({ from: shiftDate(today, 1), intent: editorialIntentForDate(today), isTaken: (candidate) => { const entry = byDate.get(candidate); return !!entry && (!!entry.landingId || entry.status !== "PLANNED"); } }) : null;
    const preparation = slot.preparation && typeof slot.preparation === "object" && !Array.isArray(slot.preparation) ? slot.preparation : {};
    await prisma.$transaction(async (tx) => {
      if (current) {
        const occupant = byDate.get(displacedTo);
        if (occupant) await tx.blogPublication.deleteMany({ where: { id: occupant.id, landingId: null, status: "PLANNED" } });
        await tx.blogPublication.update({ where: { id: current.id }, data: { scheduledDate: dateValue(displacedTo), preparation: withDateHistory(current.preparation, { from: today, to: displacedTo, reason: "displaced" }, now()) } });
      }
      await tx.blogPublication.update({ where: { id: slot.id }, data: { scheduledDate: dateValue(today), preparation: { ...withDateHistory(preparation, { from: day, to: today, reason: "published_early" }, now()), publishedEarly: { from: day, displacedTo, displacedId: current?.id || null } } } });
      await tx.blogPublication.createMany({ data: [{ clientId: client.id, scheduledDate: dateValue(day), preparation: { phase: "WAITING" } }], skipDuplicates: true });
    });
    log.log(`[blog] Artículo publicado antes de fecha: pasó del ${day} a hoy${displacedTo ? `; el de hoy se movió al ${displacedTo}` : ""}.`);
  }

  async function publishClaimedArticle(client, slot) {
    let landing;
    try {
      landing = await prisma.landing.findUnique({ where: { id: slot.landingId }, include: { contentCluster: { select: { slug: true } } } });
      const content = parseContent(landing);
      const quality = await validate(client, landing, content);
      if (!quality.publishable) {
        await prisma.landing.update({ where: { id: landing.id }, data: { htmlContent: JSON.stringify(content), status: "DRAFT", publishedAt: null } });
        await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "FAILED", attempts: 3, lastError: errors(quality), errorCode: "QUALITY_BLOCKED" } });
        return;
      }
      const day = slot.scheduledDate.toISOString().slice(0, 10);
      if (content.editorial_intent !== editorialIntentForDate(day)) throw Object.assign(new Error("La intención del artículo no coincide con la fecha; reprogramá para conservar el equilibrio."), { code: "DATE_INCOMPATIBLE" });
      content.published_at = now().toISOString();
      await prisma.landing.update({ where: { id: landing.id }, data: { status: "PUBLISHED", publishedAt: now() } });
      const url = await deployVerified(client, landing, content);
      await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "PUBLISHED", publishedAt: now(), lastError: "", errorCode: "" } });
      log.log(`[blog] Artículo publicado: ${url}`);
      // La publicación ya salió: un fallo al reubicar fechas no debe marcarla como fallida.
      try { await adoptToday(client, slot, day); } catch (error) { log.error("[blog] No se pudo mover el artículo publicado a hoy:", error); }
    } catch (error) {
      if (landing) await restorePrivateDraft(landing);
      await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "FAILED", lastError: String(error).slice(-1000), errorCode: ["DATE_INCOMPATIBLE", "QUALITY_BLOCKED", "CONNECTION"].includes(error.code) ? error.code : "DEPLOYMENT_FAILED" } });
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
        await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "PUBLISHED", lastError: "Actualización interrumpida; se reintentará.", errorCode: "DEPLOYMENT_FAILED" } });
      } else {
        if (slot.landing) await restorePrivateDraft(slot.landing);
        await prisma.blogPublication.update({ where: { id: slot.id }, data: { status: "FAILED", lastError: "Publicación interrumpida; se reintentará.", errorCode: "DEPLOYMENT_FAILED" } });
      }
    }
  }

  async function autoApproveArticle(client, slot) {
    if (!slot?.landing || !slot.requiresApproval || !["READY", "FAILED"].includes(slot.status)) return;
    if (!["DRAFT", "APPROVED"].includes(slot.landing.status)) throw new Error("El estado del artículo requiere revisión antes de aprobarlo.");
    const content = parseContent(slot.landing);
    const quality = await validate(client, slot.landing, content);
    const day = slot.scheduledDate.toISOString().slice(0, 10);
    const lastError = !quality.publishable ? errors(quality) : content.editorial_intent !== editorialIntentForDate(day) ? "La intención del artículo no coincide con la fecha; reprogramá para conservar el equilibrio." : "";
    await prisma.$transaction(async tx => {
      const changed = await tx.blogPublication.updateMany({
        where: { id: slot.id, clientId: client.id, updatedAt: slot.updatedAt, requiresApproval: true, status: slot.status, landing: { updatedAt: slot.landing.updatedAt } },
        data: lastError ? { status: "FAILED", attempts: 3, lastError, errorCode: quality.publishable ? "DATE_INCOMPATIBLE" : "QUALITY_BLOCKED" } : { status: "READY", requiresApproval: false, approvedAt: now(), attempts: 0, lastError: "", errorCode: "" },
      });
      if (!changed.count) return;
      await tx.landing.update({ where: { id: slot.landingId }, data: { status: lastError ? "DRAFT" : "APPROVED", htmlContent: JSON.stringify(content) } });
    });
  }

  // Tras borrar un artículo publicado el sitio se reconstruye completo, sin esa página.
  let removalRetryAt = 0;
  async function deployPendingRemoval(client) {
    const key = `blog_redeploy_pending:${client.id}`;
    const flag = await prisma.appSetting.findUnique({ where: { key } });
    if (!flag || !client.blogBaseUrl?.trim() || now().getTime() < removalRetryAt) return false;
    try {
      await runBlogPython(["rebuild-links"], client.id);
      await runBlogPython(["deploy", "--base-url", client.blogBaseUrl], client.id, 600_000);
      // Si llegó otro pedido durante el despliegue, queda para la próxima vuelta.
      await prisma.appSetting.deleteMany({ where: { key, value: flag.value } });
      log.log("[blog] Blog redesplegado tras eliminar artículos.");
    } catch (error) {
      removalRetryAt = now().getTime() + 15 * 60_000;
      log.error("[blog] No se pudo redesplegar tras eliminar:", error);
    }
    return true;
  }

  // Traduce de a un artículo por vuelta; el original sigue siendo la fuente de verdad.
  async function translatePending(client) {
    const key = `blog_translation_queue:${client.id}`;
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    let queue; try { queue = JSON.parse(setting?.value || "[]"); } catch { queue = []; }
    if (!Array.isArray(queue)) queue = [];
    const next = queue.find((item) => !item.error && Number(item.attempts || 0) < 2);
    if (!next) return false;
    const save = async (update) => {
      const current = await prisma.appSetting.findUnique({ where: { key } });
      let rows; try { rows = JSON.parse(current?.value || "[]"); } catch { rows = []; }
      const value = JSON.stringify(update(Array.isArray(rows) ? rows : []));
      await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    };
    const same = (item) => item.landingId === next.landingId && item.language === next.language;
    await save((rows) => rows.map((item) => same(item) ? { ...item, attempts: Number(item.attempts || 0) + 1 } : item));
    try {
      await runBlogPython(["translate", "--landing-id", next.landingId, "--language", next.language], client.id, 300_000);
      await save((rows) => rows.filter((item) => !same(item)));
      const original = await prisma.landing.findUnique({ where: { id: next.landingId }, select: { status: true } });
      if (original?.status === "PUBLISHED") {
        const value = now().toISOString();
        await prisma.appSetting.upsert({ where: { key: `blog_redeploy_pending:${client.id}` }, create: { key: `blog_redeploy_pending:${client.id}`, value }, update: { value } });
      }
      log.log(`[blog] Traducción ${next.language} lista para ${next.landingId}`);
    } catch (error) {
      const message = String(error?.message || error).slice(-500);
      await save((rows) => rows.map((item) => same(item) ? { ...item, ...(Number(item.attempts || 0) >= 2 ? { error: message } : {}) } : item));
      log.error("[blog] No se pudo traducir:", error);
    }
    return true;
  }

  async function runDailyBlogCalendar() {
    if (running) return;
    running = true;
    lastStartedAt = now().toISOString(); lastFailure = false;
    try {
      const client = await prisma.client.findUnique({ where: { slug: targetClientSlug }, select: { id: true, active: true, blogBaseUrl: true, responsePolicy: true } });
      if (!client?.active) return;
      const key = `blog_daily_schedule:${client.id}`;
      const setting = await prisma.appSetting.findUnique({ where: { key } });
      let config; try { config = JSON.parse(setting?.value || "{}"); } catch { return; }
      await recoverInterrupted(client.id);
      await recoverPreparations(prisma, client.id, now());
      const local = argentinaNow(client.responsePolicy);
      const active = config.enabled && client.blogBaseUrl?.trim() && /^([01]\d|2[0-3]):[0-5]\d$/.test(config.publishTime || "");
      // Con la publicación activa se mantienen 14 días reservados; las fechas
      // sumadas a mano desde el calendario se escriben aunque esté apagada.
      const start = shiftDate(local.date, 1);
      for (let offset = 0; active && offset < 14; offset += 1) {
        const day = shiftDate(start, offset);
        await prisma.blogPublication.upsert({ where: { clientId_scheduledDate: { clientId: client.id, scheduledDate: dateValue(day) } }, create: { clientId: client.id, scheduledDate: dateValue(day) }, update: {} });
      }
      await prisma.blogPublication.updateMany({ where: { clientId: client.id, requiresApproval: false, scheduledDate: { lt: dateValue(local.date) }, status: { in: ["PLANNED", "READY"] } }, data: { status: "SKIPPED", lastError: "La fecha pasó sin publicación; reprogramá el artículo." } });
      if (active && config.autoApprove === true) {
        const pending = await prisma.blogPublication.findMany({ where: { clientId: client.id, requiresApproval: true, scheduledDate: { gte: dateValue(local.date) }, status: { in: ["READY", "FAILED"] }, attempts: { lt: 3 }, landing: { isNot: null } }, include: { landing: true }, orderBy: { scheduledDate: "asc" } });
        for (const slot of pending) {
          // Los datos del rival los escribe la IA: siempre los revisa una persona.
          if (dayPlanArgs(slot.preparation).competitor) continue;
          try { await autoApproveArticle(client, slot); }
          catch (error) {
            await prisma.blogPublication.updateMany({ where: { id: slot.id, clientId: client.id, updatedAt: slot.updatedAt, requiresApproval: true, status: slot.status, landing: { updatedAt: slot.landing.updatedAt } }, data: { status: "FAILED", attempts: 3, lastError: String(error.message || error).slice(0, 1000) } });
            log.error("[blog] No se pudo revisar el borrador:", error);
          }
        }
      }
      const due = await prisma.blogPublication.findUnique({ where: { clientId_scheduledDate: { clientId: client.id, scheduledDate: dateValue(local.date) } }, include: { landing: { include: { contentCluster: { select: { slug: true } } } } } });
      if (active && (!config.firstPublishDate || local.date >= config.firstPublishDate) && local.time >= config.publishTime && due?.landing && !due.requiresApproval && ["READY", "FAILED"].includes(due.status) && due.attempts < 3) {
        const claimed = await prisma.blogPublication.updateMany({ where: { id: due.id, requiresApproval: false, status: { in: ["READY", "FAILED"] }, attempts: { lt: 3 } }, data: { status: "PUBLISHING", attempts: { increment: 1 }, lastError: "", errorCode: "" } });
        if (claimed.count) await publishClaimedArticle(client, due);
        return;
      }
      if (await deployEditedBlogArticle(client)) return;
      if (await deployPendingRemoval(client)) return;
      if (await translatePending(client)) return;
      if (generationClients.has(targetClientSlug)) return;
      const empty = await prisma.blogPublication.findFirst({ where: { clientId: client.id, scheduledDate: { gte: dateValue(start) }, analysisRunId: null, landingId: null, status: { in: ["PLANNED", "FAILED"] }, attempts: { lt: 3 } }, orderBy: { scheduledDate: "asc" } });
      if (!empty) return;
      generationClients.add(targetClientSlug);
      const language = empty.preparation?.language || client.responsePolicy?.blog?.language || "es";
      const day = empty.scheduledDate.toISOString().slice(0, 10);
      // La consigna del operador define el tema; reemplaza la comparativa automática.
      const brief = typeof empty.preparation?.brief === "string" ? empty.preparation.brief.trim().slice(0, 500) : "";
      // Plan del operador: producto protagonista, productos excluidos y rival elegido.
      const plan = dayPlanArgs(empty.preparation);
      const comparison = !!plan.competitor || (!brief && editorialIntentForDate(day) === "decision" && (typeof empty.preparation?.comparison === "boolean" ? empty.preparation.comparison : client.responsePolicy?.blog?.comparisons === true));
      const metadata = { ...newPreparation(now(), 240_000), language, comparison, ...(brief ? { brief } : {}), ...plan.metadata };
      const generationClaim = await prisma.blogPublication.updateMany({ where: { id: empty.id, updatedAt: empty.updatedAt, landingId: null, attempts: empty.attempts, status: { in: ["PLANNED", "FAILED"] } }, data: { attempts: { increment: 1 }, status: "PLANNED", lastError: "", errorCode: "", preparation: metadata } });
      if (!generationClaim.count) { generationClients.delete(targetClientSlug); return; }
      try {
        await runBlogPython(["generate", "--limit", "1", "--schedule-date", day, "--max-seconds", "180", "--language", language, ...(comparison ? ["--comparison"] : []), ...(brief ? ["--brief", brief] : []), ...plan.args], client.id, 240_000, {
          attemptId: metadata.attemptId,
          onPhase: phase => setPreparationPhase(prisma, empty.id, client.id, metadata, phase, now()),
        });
        const result = await prisma.blogPublication.findUnique({ where: { id: empty.id } });
        if (result?.status === "FAILED" && result.landingId) return;
        if (result?.status !== "READY") throw new Error("El generador no produjo un artículo válido para esta fecha.");
        if (plan.competitor && !result.requiresApproval) await prisma.blogPublication.updateMany({ where: { id: empty.id, status: "READY", landingId: result.landingId }, data: { requiresApproval: true, approvedAt: null } });
        log.log(`[blog] Artículo preparado para ${day}`);
      } catch (error) {
        await failPreparation(prisma, empty.id, client.id, metadata, error, now());
      } finally { generationClients.delete(targetClientSlug); }
    } catch (error) { lastFailure = true; log.error("[blog] Calendario editorial:", error); }
    finally { running = false; lastCompletedAt = now().toISOString(); }
  }
  const runLeasedCalendar = async () => {
    lastTickAt = now().toISOString(); gate = "CHECKING_INTERRUPTED";
    try {
    // Las publicaciones manuales también pueden pertenecer a otros clientes.
    const interrupted = await prisma.blogPublication.findMany({ where: { status: "PUBLISHING", updatedAt: { lt: new Date(now().getTime() - 15 * 60_000) } }, select: { clientId: true } });
    for (const clientId of new Set(interrupted.map(slot => slot.clientId))) {
      await withLease(clientId, () => recoverInterrupted(clientId));
    }
    const client = await prisma.client.findUnique({ where: { slug: targetClientSlug }, select: { id: true } });
    gate = client ? "CHECKING_CATALOG" : "CLIENT_NOT_FOUND";
    blockedByCatalog = client ? await catalogPending(client.id) : false;
    if (client && !blockedByCatalog) { gate = "WAITING_LEASE"; const result = await withLease(client.id, runDailyBlogCalendar); gate = result === null ? "LEASE_BUSY" : "IDLE"; return result; }
    if (blockedByCatalog) gate = "CATALOG_BUSY";
    } catch (error) { lastFailure = true; gate = "FAILED"; log.error("[blog] No se pudo consultar la cola", error); }
  };
  return { runDailyBlogCalendar: runLeasedCalendar, deployEditedBlogArticle, publishBlogArticle, runtimeState: () => ({ running, generating: generationClients.has(targetClientSlug), blockedByCatalog, lastTickAt, gate, lastStartedAt, lastCompletedAt, lastFailure }) };
}

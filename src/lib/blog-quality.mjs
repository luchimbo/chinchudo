// Reglas compartidas por el generador Python (vía CLI), el editor y el relay.
// La evidencia se resuelve fuera del modelo; el modelo nunca verifica fuentes.
export const QUALITY_VERSION = 1;
export const SOURCE_TYPES = ["catalog", "manufacturer", "independent", "case_study", "internal"];
const norm = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const markerPattern = /\[\[([pcgs]):([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const markers = (text) => [...String(text || "").matchAll(markerPattern)];
const sensitive = /(?:\b\d+(?:[.,]\d+)?\s*(?:%|ms|khz|hz|db|bits?|v(?:oltios)?|w(?:atts)?|gb|entradas?|salidas?|teclas?|pads?|canales?|anos?|meses?|pulgadas?|samples?|muestras?)\b|\d+(?:[.,]\d+)?\s*%|\$\s*\d|\b(?:precio|cuesta|stock|disponib\w*|garantia|compatible|compatibilidad|latencia|rendimiento|soporta|soporte (?:local|oficial|tecnico)|distribuidor oficial|exclusiv\w*|envio gratis|cuotas?|financiacion|certific\w*|demostro|logramos|aumentamos|redujimos|probamos|testeamos|nuestro cliente|testimonio|caso real|el mejor|la mejor|100 por ciento)\b)/i;
const contextual = /^(?:verifica|consulta|confirma|revisa|comproba|no (?:asumas|supongas|prometemos)|antes de comprar[,:])(?:\s|$)/i;
const productAssertion = /\b(?:ofrece\w*|tiene\w*|incluye\w*|requiere\w*|cuenta con|son (?:cerrados|abiertos|comodos|ideales)|es (?:compatible|ideal|robusto)|sin latencia|respuesta (?:plana|de graves)|mas (?:detalle|precision)|mayor (?:detalle|precision)|construccion (?:robusta|metalica))\b/i;

export function editorialIntentForDate(day) {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new Error("Fecha editorial inválida.");
  return Math.floor(time / 86400000) % 2 === 0 ? "educational" : "decision";
}

export function safeSourceUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}

export function verifiedSources(values, now = new Date()) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values.filter((source) => {
    if (!source || !/^[a-zA-Z0-9_-]{1,120}$/.test(source.id || "") || seen.has(source.id)) return false;
    const verified = Date.parse(source.verifiedAt);
    if (!SOURCE_TYPES.includes(source.type) || !String(source.title || "").trim() || !source.reviewedBy || !Number.isFinite(verified) || verified > new Date(now).getTime()) return false;
    if (!(safeSourceUrl(source.url) || String(source.reference || "").trim())) return false;
    if (!Array.isArray(source.claims) || !source.claims.length || source.claims.some((claim) => typeof claim !== "string" || !claim.trim())) return false;
    seen.add(source.id);
    return true;
  });
}

export function catalogSources(products, now = new Date()) {
  return Object.entries(products || {}).flatMap(([id, product]) => {
    const name = product.nombre || product.name;
    if (!name || !safeSourceUrl(product.url)) return [];
    return [{ id: `catalog-${id}`, title: `Ficha del catálogo: ${name}`, type: "catalog", url: product.url, reference: "", verifiedAt: new Date(product.updatedAt || now).toISOString(), reviewedBy: "Catálogo de PC MIDI", productIds: [id], claims: [String(name), ...String(product.uso || product.useText || "").split(/\n/).map((s) => s.trim()).filter(Boolean)] }];
  });
}

export function buildEditorialBrief({ topic, intent = "educational", products = {}, sources = [], now = new Date() }) {
  const evidence = verifiedSources(sources, now);
  return {
    version: QUALITY_VERSION, intent, audience: "Personas que compran o usan equipamiento musical en Argentina",
    mainQuestion: topic.keyword || topic.busqueda_objetivo || "", allowedProductIds: Object.keys(products),
    decisionCriteria: intent === "decision" ? ["Uso concreto", "Ventajas respaldadas", "Limitaciones", "Para quién conviene"] : [],
    evidence, language: "es-AR",
    brandVoices: { MidiPlus: "Técnico, claro y práctico. Claims solo con evidencia.", Kressmer: "Moderno y curioso. Evitar superlativos y claims sin evidencia." },
  };
}

function publicText(content) {
  return [content.h1, content.seo_title, content.meta_description, content.hero_lede, content.direct_answer,
    ...(content.sections || []).flatMap((s) => [s.h2, s.body]), ...(content.faqs || []).flatMap((f) => [f.q, f.a]),
    ...(content.common_mistakes || []), content.brand_solution?.title, content.brand_solution?.body,
    ...(content.components || []).flatMap((c) => [c.cat, c.why, c.look]), ...(content.steps || []).flatMap((s) => [s.t, s.b]),
    content.components_title, content.components_subtitle,
    ...(content.decision_support?.criteria || []), ...(content.decision_support?.options || []).flatMap((o) => [o.suitable_for, o.advantages, o.limitations]), content.decision_support?.recommendation,
  ].filter(Boolean).map(String);
}

export function reviewArticle({ content, sources = [], products = {}, categories = {}, existing = [], now = new Date() }) {
  const invalidRows = content && ["sections", "faqs", "components", "steps"].some((key) => Array.isArray(content[key]) && content[key].some((row) => !row || typeof row !== "object"));
  const invalidDecision = content?.decision_support && (!Array.isArray(content.decision_support.criteria) || content.decision_support.criteria.some((c) => typeof c !== "string") || !Array.isArray(content.decision_support.options) || content.decision_support.options.some((o) => !o || typeof o !== "object" || !Array.isArray(o.evidence_ids) || o.evidence_ids.some((id) => typeof id !== "string")));
  if (!content || typeof content !== "object" || invalidRows || invalidDecision || ["sections", "faqs", "components", "steps", "common_mistakes"].some((key) => content[key] !== undefined && !Array.isArray(content[key]))) {
    return { version: QUALITY_VERSION, checkedAt: new Date(now).toISOString(), publishable: false, checks: [{ id: "structure", group: "SEO", level: "error", message: "La estructura del artículo es inválida." }] };
  }
  const checks = [];
  const add = (id, group, level, message) => checks.push({ id, group, level, message });
  const trusted = new Map(verifiedSources(sources, now).map((s) => [s.id, s]));
  const references = Array.isArray(content.source_refs) ? content.source_refs : [];
  const linked = new Set();
  let badSource = false;
  for (const source of references) {
    const known = trusted.get(source?.id);
    const signature = (s) => JSON.stringify([s.title, s.type, s.url, s.reference, s.type === "catalog" ? "catalog" : Date.parse(s.verifiedAt), s.reviewedBy, s.productIds, s.claims]);
    if (!known || signature(known) !== signature(source)) badSource = true;
    else linked.add(source.id);
  }
  add("sources", "GEO", badSource ? "error" : references.length ? "ok" : "warning", badSource ? "Hay fuentes nuevas, modificadas o sin revisión en el artículo." : references.length ? `${references.length} fuente(s) revisada(s), con atribución.` : "Sin fuentes citadas: incorporar evidencia cuando se afirmen datos concretos.");

  const resolve = (text) => String(text || "").replace(markerPattern, (_, kind, ref, label) => kind === "s" ? "" : label || products[ref]?.nombre || products[ref]?.name || categories[ref]?.nombre || categories[ref]?.name || ref);
  const words = (text) => new Set(norm(text).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["para", "como", "que", "con", "del", "una", "los", "las", "por", "guia", "completa"].includes(w)));
  const topic = words(content.keyword);
  const nearDuplicate = existing.some((item) => {
    if (item.id === content.id) return false;
    const other = words(item.keyword);
    const union = new Set([...topic, ...other]).size;
    const shared = [...topic].filter((word) => other.has(word)).length;
    return topic.size >= 3 && other.size >= 3 && union && shared / union >= (item.content_type === "LEGACY" ? 0.8 : 0.6);
  });
  add("topic-duplicate", "SEO", nearDuplicate ? "error" : "ok", nearDuplicate ? "El tema se parece demasiado a otra búsqueda ya cubierta. Elegí otro enfoque." : "Tema diferenciado de las otras búsquedas.");
  for (const field of ["keyword", "h1", "seo_title", "meta_description"]) {
    const value = norm(content[field]);
    const duplicate = existing.some((item) => item.id !== content.id && (norm(item[field] || (field === "h1" ? item.titulo : "")) === value));
    add(field, "SEO", !value || duplicate ? "error" : "ok", !value ? `Falta ${field}.` : duplicate ? `${field} coincide con otro artículo.` : `${field} propio y presente.`);
  }
  const answer = resolve(content.direct_answer).trim();
  add("answer", "AEO", answer.length < 50 ? "error" : "ok", answer.length < 50 ? "Falta una respuesta directa completa al comienzo." : "Respuesta directa al comienzo.");
  const sections = content.sections || [];
  add("structure", "AEO", sections.length < 3 || sections.some((s) => !s.h2 || !s.body) ? "error" : "ok", sections.length < 3 ? "El artículo necesita secciones propias que desarrollen la respuesta." : "Secciones con subtítulos y explicaciones.");
  const repeatedFaq = (content.faqs || []).some((f) => norm(resolve(f.q)) === norm(resolve(content.h1)) || norm(resolve(f.a)) === norm(answer));
  add("faq", "AEO", repeatedFaq ? "error" : "ok", repeatedFaq ? "Una pregunta frecuente repite el título o la respuesta inicial." : "Preguntas frecuentes sin repetición exacta de la respuesta inicial.");
  const catalogMarkers = publicText(content).flatMap(markers).filter((m) => m[1] === "p" || m[1] === "c");
  const allowed = content.editorial_brief?.allowedProductIds;
  const invalid = catalogMarkers.some((m) => m[1] === "p" ? !products[m[2]] || (Array.isArray(allowed) && !allowed.includes(m[2])) : !categories[m[2]]);
  add("catalog", "SEO", invalid ? "error" : catalogMarkers.length < 2 ? "warning" : "ok", invalid ? "Hay enlaces fuera del catálogo permitido." : catalogMarkers.length < 2 ? "Agregar enlaces pertinentes hacia la tienda." : "Enlaces pertinentes al catálogo.");

  const usedSources = new Set();
  const unsupported = [];
  for (const text of publicText(content)) {
    for (const marker of markers(text).filter((m) => m[1] === "s")) {
      usedSources.add(marker[2]);
      if (!linked.has(marker[2])) unsupported.push(`Referencia desconocida: ${marker[2]}`);
    }
    for (const sentence of text.split(/(?<=[.!?])\s+(?!\[\[s:)|\n/)) {
      const plain = resolve(sentence).trim();
      const optionText = (content.decision_support?.options || []).some((o) => [o.suitable_for, o.advantages, o.limitations].includes(text));
      const productMention = optionText || markers(sentence).some((m) => m[1] === "p") || Object.values(products).some((p) => (p.nombre || p.name) && norm(plain).includes(norm(p.nombre || p.name)));
      // Un criterio de compra no es una afirmación sobre un producto.
      // Conservamos las alarmas cuando se afirma un precio, disponibilidad o superioridad.
      const withoutNames = Object.values(products).reduce((value, p) => {
        const name = norm(p.nombre || p.name);
        return name ? value.split(name).join("producto") : value;
      }, norm(plain));
      const factText = withoutNames
        .replace(/\b(?:espacio|tiempo|lugar|opciones|formas de onda) disponibles?\b/g, "")
        .replace(/\b(?:no es solo cuestion de|elegir solo por|sin mirar el|considerar el) precio\b/g, "")
        .replace(/\bla mejor eleccion depende\b/g, "la eleccion depende");
      const criterionLabel = (content.decision_support?.criteria || []).includes(text) && !/\b(?:tiene|incluye|cuesta|ofrece|es|son|garantiza)\b/.test(factText);
      const concrete = !criterionLabel && (sensitive.test(factText) || (productMention && productAssertion.test(norm(plain))));
      if (!concrete || contextual.test(norm(plain)) || /\?$/.test(plain) || /^(?:como|cómo|qué|que|cuál|cual)\b/i.test(plain)) continue;
      const cited = markers(sentence).filter((m) => m[1] === "s").map((m) => trusted.get(m[2])).filter(Boolean);
      // Una cita no autoriza inferencias nuevas: la frase sensible debe estar
      // explícitamente en las afirmaciones que revisó el operador.
      const claim = norm(plain).replace(/[.!?]+$/, "").trim();
      const isCase = /(?:probamos|testeamos|nuestro cliente|testimonio|caso real|logramos|aumentamos|redujimos)/i.test(plain);
      const supported = cited.some((s) => linked.has(s.id) && (!isCase || s.type === "case_study") && s.claims.some((c) => {
        const approved = norm(c).replace(/[.!?]+$/, "").trim();
        if (approved === claim) return true;
        // Permite atribuir literalmente el uso de una ficha a su producto.
        // No permite agregar ventajas ni cambiar los datos de esa afirmación.
        const clean = norm(claim.replace(/["“”‘’]/g, "")).trim();
        return (s.productIds || []).some((id) => {
          const name = norm(products[id]?.nombre || products[id]?.name);
          return name && [name, `el ${name}`, `la ${name}`].some((prefix) => [`${prefix}: ${approved}`, `${prefix} es un ${approved}`, `${prefix} es una ${approved}`, `${prefix} se describe como ${approved}`].includes(clean));
        });
      }));
      if (!supported) unsupported.push(plain.slice(0, 180));
    }
  }
  add("claims", "GEO", unsupported.length ? "error" : "ok", unsupported.length ? `Afirmaciones sin respaldo explícito: ${[...new Set(unsupported)].slice(0, 4).join(" · ")}` : "Las afirmaciones sensibles detectadas tienen respaldo explícito.");
  if (content.author_name && /(?:doctor|ingeniero|especialista certificado)/i.test(content.author_name)) add("author", "GEO", "error", "La autoría agrega credenciales no verificadas.");
  else add("author", "GEO", "ok", "Autoría editorial del equipo, sin credenciales inventadas.");

  const intent = content.editorial_intent || "educational";
  const decision = content.decision_support;
  if (intent === "decision") {
    const complete = decision && Array.isArray(decision.criteria) && decision.criteria.filter((c) => typeof c === "string" && c.trim()).length >= 2 && Array.isArray(decision.options) && decision.options.length >= 2 && decision.recommendation;
    add("decision", "DEO", complete ? "ok" : "error", complete ? "Criterios, alternativas y recomendación según el uso." : "Faltan criterios, dos alternativas y una recomendación justificada.");
  } else {
    const criteria = (content.components || []).filter((c) => c.why && c.look);
    add("decision", "DEO", criteria.length >= 2 ? "ok" : "error", criteria.length >= 2 ? "La guía explica criterios prácticos para tomar una decisión." : "Agregar al menos dos criterios prácticos de elección a la guía educativa.");
  }
  if (decision) {
    const options = Array.isArray(decision.options) ? decision.options : [];
    const invalidOptions = new Set(options.map((o) => o.product_id)).size !== options.length || options.some((o) => !products[o.product_id] || (Array.isArray(allowed) && !allowed.includes(o.product_id)) || !o.suitable_for || !o.advantages || !o.limitations || !Array.isArray(o.evidence_ids) || !o.evidence_ids.length || o.evidence_ids.some((id) => !linked.has(id) || !(trusted.get(id)?.productIds || []).includes(o.product_id)));
    options.forEach((o) => (o.evidence_ids || []).forEach((id) => usedSources.add(id)));
    add("comparison", "DEO", invalidOptions ? "error" : "ok", invalidOptions ? "Cada alternativa requiere producto del catálogo, uso, ventajas, limitaciones y evidencia de ese producto." : "Comparación de productos del catálogo con ventajas, limitaciones y evidencia.");
  }
  const unused = references.filter((s) => !usedSources.has(s.id));
  if (unused.length) add("unused-sources", "GEO", "warning", "Hay fuentes listadas que no se citaron en el texto ni en la comparación.");
  return { version: QUALITY_VERSION, checkedAt: new Date(now).toISOString(), publishable: !checks.some((c) => c.level === "error"), checks };
}

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function shouldRunBlogCalendar(client, secondaryCalendars = false) {
  if (secondaryCalendars && client.slug === "pcmidi") return false;
  return client.slug === "pcmidi" ? client.responsePolicy?.blog?.calendar !== false : client.responsePolicy?.blog?.calendar === true;
}

export function catalogSyncBlocksBlog(run, now = Date.now()) {
  if (!run || !["QUEUED", "RUNNING", "PENDING_DEPLOY", "DEPLOYING"].includes(run.status)) return false;
  const age = now - new Date(run.updatedAt).getTime();
  // Catalog work holds the same execution lease while mutating/deploying.
  // A stale queue entry must not freeze publishing indefinitely.
  return Number.isFinite(age) && age >= 0 && age < 15 * 60_000;
}

/** Repair obsolete links and missing closing copy without inventing product facts. */
export function repairBlogContent(original, { products = [], categories = [], clientName }) {
  const content = structuredClone(original), changes = [], replacements = new Map();
  const available = new Map(products.filter(p => p.url && p.linkStatus !== "missing" && p.sourceSnapshot?.editorialEligible !== false).map(p => [p.externalId, p]));
  const byName = new Map();
  for (const product of available.values()) {
    const key = normalize(product.name), matches = byName.get(key) || [];
    matches.push(product); byName.set(key, matches);
  }
  const rewrite = value => {
    if (typeof value === "string") return value.replace(/\[\[p:([^\]|]+)(?:\|([^\]]+))?\]\]/g, (marker, id, label) => {
      if (available.has(id)) return marker;
      const matches = byName.get(normalize(label)) || [];
      if (matches.length === 1) { replacements.set(id, matches[0].externalId); changes.push("catalog-reference"); return `[[p:${matches[0].externalId}|${label}]]`; }
      // An unavailable or ambiguous destination becomes plain text, never an
      // invented link to a different model. Preserve the operator's wording.
      changes.push("unavailable-link"); return label || "el producto mencionado";
    });
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  };
  const repaired = rewrite(content);
  if (Array.isArray(repaired.product_ids)) {
    const ids = [...new Set(repaired.product_ids.map(id => replacements.get(id) || id).filter(id => available.has(id)))];
    if (JSON.stringify(ids) !== JSON.stringify(repaired.product_ids)) changes.push("product-list");
    repaired.product_ids = ids;
  }
  if (repaired.editorial_brief?.allowedProductIds) repaired.editorial_brief.allowedProductIds = repaired.editorial_brief.allowedProductIds.map(id => replacements.get(id) || id).filter(id => available.has(id));
  if (!repaired.brand_solution?.body && ["es", "en", "de"].includes(repaired.language || "es") && clientName) {
    const selected = categories.filter(c => c.url && c.linkStatus !== "missing" && [repaired.primary_category_id, ...(repaired.secondary_category_ids || [])].includes(c.key)).slice(0, 2);
    const refs = selected.map(c => `[[c:${c.key}|${c.name}]]`).join(", ");
    const copy = {
      es: { title: `Compará opciones en ${clientName}`, body: `En ${clientName} podés consultar ${refs || "las fichas del catálogo"} y comparar las características de cada opción antes de elegir. Consultá al equipo si necesitás confirmar compatibilidad o detalles del producto.` },
      en: { title: `Compare options at ${clientName}`, body: `At ${clientName}, review ${refs || "the catalog specifications"} and compare each option before choosing. Ask the team to confirm compatibility or product details.` },
      de: { title: `Optionen bei ${clientName} vergleichen`, body: `Bei ${clientName} kannst du ${refs || "die Angaben im Katalog"} prüfen und die Optionen vergleichen. Frag das Team, wenn du Kompatibilität oder Produktdetails bestätigen möchtest.` },
    };
    repaired.brand_solution = copy[repaired.language || "es"]; changes.push("brand-closing");
  }
  return { content: repaired, changes: [...new Set(changes)] };
}

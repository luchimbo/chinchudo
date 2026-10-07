import { verifiedSources } from "./blog-quality.mjs";

const markers = (text) => [...String(text || "").matchAll(/\[\[([pcgs]):([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
const norm = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const stop = new Set("como para elegir guia completa comprar compra una unos unas las los con del por que segun puede mejor necesitas necesita practica practico primer primera".split(" "));
const terms = (text) => new Set(norm(text).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stop.has(w)));
const overlap = (left, right) => [...left].filter(w => right.has(w)).length;
const label = (text) => String(text || "").replace(/[\[\]|]/g, "").trim();
const fit = (text, max) => {
  const value = String(text || "").trim();
  return value.length <= max ? value : value.slice(0, max - 1).replace(/\s+\S*$/, "").trimEnd() + "…";
};

/** Completa enlaces y citas con destinos existentes. Nunca inventa fuentes ni claims. */
export function completeArticle({ content, catalog, sources = [] }) {
  const result = structuredClone(content);
  const trusted = verifiedSources(sources);
  const sourceBank = new Map(trusted.map(s => [s.id, s]));
  const refs = new Map((result.source_refs || []).map(s => [s.id, s]));
  // Las URLs de investigación no son fuentes revisadas. Se conservan como tales.
  for (const [id, source] of refs) {
    if (result.analysis_run_id && id.startsWith(`analysis-${result.analysis_run_id}-`) && source.type === "external" && !source.reviewedBy) {
      result.research_source_urls = [...new Set([...(result.research_source_urls || []), source.url].filter(Boolean))];
      refs.delete(id);
    }
  }
  const sections = Array.isArray(result.sections) ? result.sections : [];
  const used = new Set(sections.flatMap(s => markers(s.body)).map(m => `${m[1]}:${m[2]}`));
  const changes = [];
  const entries = [
    ...(catalog.products || []).map(p => ({ ...p, kind: "p" })),
    ...(catalog.categories || []).map(c => ({ ...c, kind: "c" })),
  ].filter(e => !e.disabled && e.ref && e.name && !(e.kind === "c" && e.ref === "home"));
  const bodyText = sections.map(s => String(s.body || "")).join("\n").toLowerCase();
  const aliases = entries.flatMap(e => [...new Set([e.name, ...(e.aliases || [])])]
    .filter(name => typeof name === "string" && name.trim().length >= 4 && bodyText.includes(name.trim().toLowerCase()) && (e.kind === "p" ? name.trim().split(/\s+/).length >= 2 || /\d/.test(name) : terms(name).size >= 2))
    .map(name => ({ entry: e, name: name.trim() }))).sort((a, b) => b.name.length - a.name.length);
  const owners = new Map();
  for (const alias of aliases) { const key = norm(alias.name); if (!owners.has(key)) owners.set(key, new Set()); owners.get(key).add(`${alias.entry.kind}:${alias.entry.ref}`); }
  for (const section of sections) {
    let budget = 8000 - String(section.body || "").length;
    const parts = String(section.body || "").split(/(\[\[[pcgs]:[^\]]+\]\])/g);
    section.body = parts.map(part => {
      if (part.startsWith("[[")) return part;
      // El reemplazo se vuelve a segmentar: nunca escribe dentro de otro enlace.
      let chunks = [part];
      for (const { entry, name } of aliases) {
        // Un modelo compartido por varias variantes no identifica una ficha.
        if (owners.get(norm(name)).size > 1 && norm(name) !== norm(entry.name)) continue;
        const key = `${entry.kind}:${entry.ref}`;
        if (used.has(key)) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
        chunks = chunks.flatMap(chunk => {
          if (chunk.startsWith("[[") || used.has(key)) return [chunk];
          const match = pattern.exec(chunk);
          if (!match) return [chunk];
          const marker = `[[${key}|${label(match[0])}]]`;
          if (marker.length - match[0].length > budget) return [chunk];
          budget -= marker.length - match[0].length;
          used.add(key); changes.push("catalog-link");
          return [chunk.slice(0, match.index), marker, chunk.slice(match.index + match[0].length)];
        });
      }
      return chunks.join("");
    }).join("");
  }
  // La ficha acredita el producto citado; la cita queda junto a su nombre,
  // sin presentar como verificadas todas las afirmaciones del párrafo.
  const cited = new Set(sections.flatMap(s => markers(s.body)).filter(m => m[1] === "s").map(m => m[2]));
  for (const section of sections) {
    let budget = 8000 - section.body.length;
    section.body = section.body.replace(/\[\[p:([^\]|]+)(?:\|([^\]]+))?\]\]/g, (marker, id) => {
      const source = trusted.find(s => s.type === "catalog" && (s.productIds || []).includes(id));
      if (!source || cited.has(source.id)) return marker;
      const citation = ` [[s:${source.id}]]`;
      if (citation.length > budget) return marker;
      budget -= citation.length;
      cited.add(source.id); refs.set(source.id, source); changes.push("source-citation");
      return marker + citation;
    });
  }
  for (const id of cited) if (sourceBank.has(id)) refs.set(id, sourceBank.get(id));
  const topic = terms(`${result.keyword || ""} ${result.h1 || ""}`);
  const related = (catalog.guides || []).filter(g => !g.disabled && g.ref !== result.slug)
    .map(g => ({ guide: g, score: overlap(topic, terms(`${g.name} ${g.keyword || ""} ${g.detail || ""}`)) }))
    .filter(g => g.score >= 2).sort((a, b) => b.score - a.score || a.guide.ref.localeCompare(b.guide.ref));
  if (sections.length && !sections.some(s => markers(s.body).some(m => m[1] === "g" && (catalog.guides || []).some(g => g.ref === m[2] && !g.disabled))) && related.length) {
    const guide = related[0].guide;
    const ranked = sections.map((s, index) => ({ index, score: overlap(terms(`${s.h2} ${s.body}`), terms(guide.name)) })).sort((a, b) => b.score - a.score);
    const destination = ranked.find(s => sections[s.index].body.length + guide.name.length + guide.ref.length + 55 <= 8000);
    if (destination) { sections[destination.index].body += `\n\nPara ampliar este tema, leé [[g:${guide.ref}|${label(guide.name)}]].`; changes.push("guide-link"); }
  }
  for (const [field, max] of [["seo_title", 70], ["meta_description", 180], ["hero_lede", 500]]) {
    if (typeof result[field] === "string") {
      let next = fit(result[field], max);
      if (field === "seo_title" && (result[field].length > max || result[field].endsWith("…"))) {
        const main = result[field].split(/(?<=\?)\s+|:\s+|\s+[|–—]\s+/)[0];
        if (main.length >= 30 && main.length <= max) next = main;
      }
      if (next !== result[field]) { result[field] = next; changes.push(field); }
    }
  }
  result.source_refs = [...refs.values()];
  result.source_ids = result.source_refs.map(s => s.id);
  result.product_ids = [...new Set([...(result.product_ids || []), ...sections.flatMap(s => markers(s.body)).filter(m => m[1] === "p" && (catalog.products || []).some(p => p.ref === m[2] && !p.disabled)).map(m => m[2])])];
  return { content: result, changes, relatedAvailable: related.length > 0 };
}
